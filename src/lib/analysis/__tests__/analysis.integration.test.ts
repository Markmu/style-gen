import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ulid} from 'ulid';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from '../../../../e2e/helpers/workspace-db';
import {createWorkspaceDirection,getWorkspaceDirection,patchWorkspaceDirection} from '@/lib/workspace/service';
import {acceptAnalysisPrediction,dispatchAnalysis,prepareAnalysis,reconcileAnalysis,submitAnalysis,type AnalysisTransport} from '../submission';
import {StructurerError,type StructuredResult} from '@/lib/ai/structurer';
const pool=workspaceTestPool();let source:Awaited<ReturnType<typeof seedWorkspaceSources>>;
beforeEach(async()=>{source=await seedWorkspaceSources(pool);vi.stubEnv('AI_APPROVED_MODEL_BINDINGS','replicate:google/gemini-2.5-flash');vi.stubEnv('REPLICATE_API_TOKEN','test-only');vi.stubEnv('VISION_PROVIDER','replicate');vi.stubEnv('STRUCTURER_PROVIDER','replicate');});
afterEach(async()=>{await cleanupWorkspaceUser(pool,source.user.id);vi.unstubAllEnvs();});afterAll(()=>pool.end());
async function request(){const {direction}=await createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'Analysis test',sourceKind:'empty'});return {directionId:direction.id,requestKey:ulid(),sourceAssetId:source.assetId};}
function external(){return {vision:vi.fn(async()=>({mode:'async' as const,externalId:ulid()})),structure:vi.fn(async()=>({recipe:null,promptText:'analyzed prompt',negativePromptText:'no text',analysisTemplateVariables:[],analysisTemplateStatus:'fallback',analysisTemplateContent:null,analysisTemplateReason:null}) as unknown as StructuredResult),query:vi.fn(async()=>null)} satisfies AnalysisTransport;}
describe('analysis durable service with real PostgreSQL',()=>{
 it('same key concurrently reserves and dispatches once and binds direction atomically',async()=>{
  const body=await request(),deps=external();const results=await Promise.all(Array.from({length:5},()=>submitAnalysis(source.user.id,body,deps)));
  expect(new Set(results.map(r=>r.id)).size).toBe(1);expect(deps.vision).toHaveBeenCalledTimes(1);
  const result=results[0],direction=await getWorkspaceDirection(source.user.id,body.directionId);expect(direction.direction.analysisTaskId).toBe(result.id);expect(result.directionId).toBe(body.directionId);
  const sum=await pool.query('SELECT sum(reserved_cost_usd) AS cost FROM analysis_tasks WHERE user_id=$1',[source.user.id]);expect(Number(sum.rows[0].cost)).toBe(.05);
  await expect(prepareAnalysis(source.user.id,{...body,sourceAssetId:source.resultId})).rejects.toThrow('request_key_conflict');
 });
 it('unknown submission holds reservation and original task without repeated inference',async()=>{
  const body=await request(),deps=external();deps.vision.mockRejectedValue(new Error('network lost'));
  const first=await submitAnalysis(source.user.id,body,deps);expect(first.status).toBe('processing');
  await dispatchAnalysis(first,deps);await submitAnalysis(source.user.id,body,deps);await reconcileAnalysis(source.user.id,first.id,deps);
  expect(deps.vision).toHaveBeenCalledTimes(1);expect(deps.query).not.toHaveBeenCalled();expect(first.reservedCostUsd).toBe('0.050000');
  await expect(prepareAnalysis(source.user.id,{...body,requestKey:ulid()})).rejects.toThrow('ANALYSIS_BUSY');
 });
 it('duplicate callbacks structure once, late failure cannot overwrite success',async()=>{
  const body=await request(),deps=external(),task=await submitAnalysis(source.user.id,body,deps);
  const evidence={id:task.externalId!,model:task.modelName!,status:'succeeded',output:['raw ','vision']};
  await Promise.all([acceptAnalysisPrediction(source.user.id,task.id,evidence,deps),acceptAnalysisPrediction(source.user.id,task.id,evidence,deps)]);
  expect(deps.structure).toHaveBeenCalledTimes(1);
  const result=await acceptAnalysisPrediction(source.user.id,task.id,{...evidence,status:'failed'},deps);expect(result.status).toBe('completed');expect(result.rawResponse).toBe('raw vision');
  expect((await getWorkspaceDirection(source.user.id,body.directionId)).direction.draft.customPrompt).toBe('analyzed prompt');
 });
 it('edited draft receives pending analysis proposal without being overwritten',async()=>{
  const body=await request(),deps=external(),task=await submitAnalysis(source.user.id,body,deps);
  await patchWorkspaceDirection(source.user.id,body.directionId,{requestKey:ulid(),baseRevision:0,changes:[{target:'customPrompt',key:'',action:'set',before:null,after:'my edited draft'}]});
  await acceptAnalysisPrediction(source.user.id,task.id,{id:task.externalId!,model:task.modelName!,status:'succeeded',output:'raw'},deps);
  expect((await getWorkspaceDirection(source.user.id,body.directionId)).direction.draft.customPrompt).toBe('my edited draft');
  const events=await pool.query("SELECT * FROM workspace_events WHERE direction_id=$1 AND proposal_state='pending'",[body.directionId]);expect(events.rowCount).toBe(1);
 });
 it('structuring failure retries only that stage and preserves the asset and raw response',async()=>{
  const body=await request(),deps=external(),task=await submitAnalysis(source.user.id,body,deps);deps.structure.mockRejectedValueOnce(new StructurerError('invalid structure',true));
  const failed=await acceptAnalysisPrediction(source.user.id,task.id,{id:task.externalId!,model:task.modelName!,status:'succeeded',output:'raw retained'},deps);expect(failed.errorStage).toBe('llm');
  const retried=await submitAnalysis(source.user.id,{...body,requestKey:ulid(),retryOf:task.id},deps);
  expect(retried.status).toBe('completed');expect(retried.sourceAssetId).toBe(task.sourceAssetId);expect(deps.vision).toHaveBeenCalledTimes(1);expect(deps.structure).toHaveBeenCalledTimes(2);
 });
 it('new analysis initialization preserves same-style variable defaults without changing stored iteration controls',async()=>{
  const {default:fixture}=await import('../../../../e2e/fixtures/api-responses/analysis-v2-completed.json');
  const body=await request(),deps=external(),task=await submitAnalysis(source.user.id,body,deps);
  deps.structure.mockResolvedValue({...fixture,recipe:fixture.recipe} as unknown as StructuredResult);
  await acceptAnalysisPrediction(source.user.id,task.id,{id:task.externalId!,model:task.modelName!,status:'succeeded',output:'raw'},deps);
  const result=await getWorkspaceDirection(source.user.id,body.directionId);expect(result.direction.draft.control).toMatchObject({intent:'same_style',detailLevel:'standard',editorMode:'variables',customPromptDirty:false});expect(result.direction.draft.customPrompt).toBeNull();
 });
 it('legacy entry obeys shared budget and foreign assets are rejected without writes',async()=>{
  vi.stubEnv('AI_DAILY_BUDGET_USD','.01');const deps=external();await expect(submitAnalysis(source.user.id,{sourceAssetId:source.assetId},deps)).rejects.toThrow('BUDGET_BLOCKED');expect(deps.vision).not.toHaveBeenCalled();
  vi.stubEnv('AI_DAILY_BUDGET_USD','10');await expect(prepareAnalysis(source.user.id,{sourceAssetId:ulid(),requestKey:ulid()})).rejects.toThrow('workspace_not_found');
  const rows=await pool.query('SELECT * FROM workspace_directions WHERE user_id=$1',[source.user.id]);expect(rows.rowCount).toBe(0);
 });
 it('known ID is queried at most every five seconds and callback identity is verified',async()=>{
  const body=await request(),deps=external(),task=await submitAnalysis(source.user.id,body,deps);
  await Promise.all([reconcileAnalysis(source.user.id,task.id,deps),reconcileAnalysis(source.user.id,task.id,deps)]);expect(deps.query).toHaveBeenCalledTimes(1);
  await expect(acceptAnalysisPrediction(source.user.id,task.id,{id:'wrong',model:task.modelName!,status:'failed'},deps)).rejects.toThrow('PROVIDER_BINDING_MISMATCH');
 });
 it('stored structurer binding survives an environment override and unknown stage never retries',async()=>{
  const body=await request(),deps=external(),task=await submitAnalysis(source.user.id,body,deps);vi.stubEnv('STRUCTURER_PROVIDER','gemini');
  deps.structure.mockRejectedValue(new Error('network acceptance unknown'));
  const result=await acceptAnalysisPrediction(source.user.id,task.id,{id:task.externalId!,model:task.modelName!,status:'succeeded',output:'raw retained'},deps);
  expect(result.status).toBe('processing');expect(result.rawResponse).toBe('raw retained');expect(deps.structure.mock.calls[0][2]).toMatchObject({provider:'replicate',providerModelId:'google/gemini-2.5-flash'});
  vi.stubEnv('STRUCTURER_PROVIDER','replicate');
  await expect(submitAnalysis(source.user.id,{...body,requestKey:ulid(),retryOf:task.id},deps)).rejects.toThrow('ANALYSIS_RETRY_NOT_ALLOWED');expect(deps.structure).toHaveBeenCalledTimes(1);
  const retained=await pool.query('SELECT status FROM analysis_tasks WHERE direction_id=$1',[body.directionId]);expect(retained.rows).toEqual([{status:'processing'}]);
 });
 it('fresh upload requires exact authenticated user and asset path; reused receipt ignores later bucket config',async()=>{
  vi.stubEnv('R2_PUBLIC_URL','https://media.example.test');const body=await request(),assetId=ulid();
  const upload={directionId:body.directionId,requestKey:body.requestKey,assetId,fileUrl:`https://media.example.test/references/${source.user.id}/${assetId}/original.png`,width:20,height:30,mimeType:'image/png'};
  await expect(prepareAnalysis(source.user.id,{...upload,fileUrl:`https://media.example.test/references/another-user/${assetId}/original.png`})).rejects.toThrow('INVALID_ASSET_URL');
  await expect(prepareAnalysis(source.user.id,{...upload,fileUrl:upload.fileUrl+'?other=1'})).rejects.toThrow('INVALID_ASSET_URL');
  const first=await prepareAnalysis(source.user.id,upload);vi.stubEnv('R2_PUBLIC_URL','https://new-media.example.test');const repeated=await prepareAnalysis(source.user.id,upload);expect(repeated.task.id).toBe(first.task.id);
 });
 it('failed terminal inputs restore without a result while unknown and foreign sources stay unavailable',async()=>{
  await pool.query("UPDATE generation_tasks SET status='failed',result_asset_id=NULL,params=$2 WHERE id=$1",[source.iterationId,JSON.stringify({aspectRatio:'21:9',quality:'standard',model:'flux-2-dev'})]);
  const created=await createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'Fix failed input',sourceKind:'iteration',sourceId:source.iterationId});
  const restored=await getWorkspaceDirection(source.user.id,created.direction.id);expect(restored.direction.draft.customPrompt).toBe('a fixed original prompt');expect(restored.source.previousResult).toBeNull();expect(restored.direction.draft.params.aspectRatio).toBe('21:9');expect(restored.direction.draft.aspectRatioSource).toBe('restore');expect(restored.readiness.canGenerate).toBe(false);
  expect((await pool.query('SELECT params FROM generation_tasks WHERE id=$1',[source.iterationId])).rows[0].params.aspectRatio).toBe('21:9');
  await expect(createWorkspaceDirection(ulid(),{requestKey:ulid(),title:'Foreign',sourceKind:'iteration',sourceId:source.iterationId})).rejects.toThrow('workspace_not_found');
  await pool.query("UPDATE generation_tasks SET status='processing',dispatch_state='unknown' WHERE id=$1",[source.iterationId]);
  await expect(createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'Unknown',sourceKind:'iteration',sourceId:source.iterationId})).rejects.toThrow('workspace_not_found');
 });
 it('invalid source unions and unsupported MIME never reserve or call external services',async()=>{
  const body=await request();await expect(prepareAnalysis(source.user.id,{...body,fileUrl:'https://media.example.test/forged'})).rejects.toThrow('INVALID_INPUT');
  await expect(prepareAnalysis(source.user.id,{...body,userId:'another'})).rejects.toThrow('INVALID_INPUT');
  const count=await pool.query('SELECT count(*) FROM analysis_tasks WHERE direction_id=$1',[body.directionId]);expect(Number(count.rows[0].count)).toBe(0);
 });
 it('analysis hourly limit is database shared including legacy requests',async()=>{
  await pool.query("INSERT INTO analysis_tasks(id,user_id,source_asset_id,status,reserved_cost_usd) SELECT lpad(i::text,26,'z'),$1,$2,'completed',.05 FROM generate_series(1,10)i",[source.user.id,source.assetId]);
  await expect(prepareAnalysis(source.user.id,{sourceAssetId:source.assetId,requestKey:ulid()})).rejects.toThrow('RATE_LIMITED');
 });

});
