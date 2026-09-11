import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ulid} from 'ulid';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from '../../../../e2e/helpers/workspace-db';
import fixture from '../../../../e2e/fixtures/api-responses/analysis-v2-completed.json';
import {createWorkspaceDirection,getWorkspaceDirection,patchWorkspaceDirection,workspaceCommand} from '../service';
import {acceptAnalysisPrediction,submitAnalysis,type AnalysisTransport} from '@/lib/analysis/submission';
import {submitGeneration,prepareGeneration,type SubmissionDependencies} from '@/lib/generation/submission';
import type {StructuredResult} from '@/lib/ai/structurer';
const pool=workspaceTestPool();let source:Awaited<ReturnType<typeof seedWorkspaceSources>>;
beforeEach(async()=>{source=await seedWorkspaceSources(pool);vi.stubEnv('AI_APPROVED_MODEL_BINDINGS','replicate:google/gemini-2.5-flash,replicate:black-forest-labs/flux-2-dev');vi.stubEnv('REPLICATE_API_TOKEN','test-only');vi.stubEnv('VISION_PROVIDER','replicate');vi.stubEnv('STRUCTURER_PROVIDER','replicate');vi.stubEnv('IMAGE_GEN_PROVIDER','replicate');});
afterEach(async()=>{await cleanupWorkspaceUser(pool,source.user.id);vi.unstubAllEnvs();});afterAll(()=>pool.end());
async function armed(){const {direction}=await createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'Quick',sourceKind:'empty'});const activationId=ulid();const result=await workspaceCommand(source.user.id,direction.id,{requestKey:ulid(),action:'armQuick',baseRevision:0,activationId});return result.direction;}
function analysisDeps(){return {vision:vi.fn(async()=>({mode:'async' as const,externalId:ulid()})),structure:vi.fn(async()=>({...fixture,recipe:fixture.recipe}) as unknown as StructuredResult),query:vi.fn(async()=>null)} satisfies AnalysisTransport;}
async function completed(direction:Awaited<ReturnType<typeof armed>>){const deps=analysisDeps();const task=await submitAnalysis(source.user.id,{directionId:direction.id,sourceAssetId:source.assetId,requestKey:ulid()},deps);await acceptAnalysisPrediction(source.user.id,task.id,{id:task.externalId!,model:task.modelName!,status:'succeeded',output:'raw'},deps);return (await getWorkspaceDirection(source.user.id,direction.id)).direction;}
describe('quick authorization source and consumption',()=>{
 it('quick honors disclosed reference ratio instead of a prior user ratio; ordinary analysis preserves that user ratio',async()=>{
  await pool.query('UPDATE assets SET width=300,height=400 WHERE id=$1',[source.assetId]);
  for(const quick of [true,false]){const {direction}=await createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'Ratio policy',sourceKind:'empty'});const edited=await patchWorkspaceDirection(source.user.id,direction.id,{requestKey:ulid(),baseRevision:0,changes:[{target:'aspectRatio',key:'',action:'set',before:'1:1',after:'16:9'}]});
   const target=quick?(await workspaceCommand(source.user.id,direction.id,{requestKey:ulid(),action:'armQuick',baseRevision:edited.direction.draftRevision,activationId:ulid()})).direction:edited.direction;
   const ready=await completed(target);expect(ready.draft.params.aspectRatio).toBe(quick?'3:4':'16:9');expect(ready.draft.aspectRatioSource).toBe(quick?'reference':'user');expect(ready.quickState).toBe(quick?'armed':'none');
  }
 });

 it('another tab binding wins only its exact task and key, then the initiating page can invalidate without a render',async()=>{
  const direction=await armed(),deps=analysisDeps(),winningKey=ulid();const winner=await submitAnalysis(source.user.id,{directionId:direction.id,sourceAssetId:source.assetId,requestKey:winningKey},deps);
  const event=(await pool.query('SELECT input_text FROM workspace_events WHERE id=$1',[direction.quickAuthorizationId])).rows[0];expect(JSON.parse(event.input_text)).toMatchObject({phase:'bound',analysisTaskId:winner.id,analysisRequestKey:winningKey,sourceAssetId:source.assetId});
  await expect(submitAnalysis(source.user.id,{directionId:direction.id,sourceAssetId:source.assetId,requestKey:ulid()},deps)).rejects.toThrow('ANALYSIS_BUSY');
  await workspaceCommand(source.user.id,direction.id,{requestKey:ulid(),action:'clearQuick',baseRevision:0,activationId:direction.quickActivationId});
  await acceptAnalysisPrediction(source.user.id,winner.id,{id:winner.externalId!,model:winner.modelName!,status:'succeeded',output:'raw'},deps);
  const current=(await getWorkspaceDirection(source.user.id,direction.id)).direction;expect(current.quickState).toBe('none');await expect(prepareGeneration(source.user.id,{directionId:direction.id,requestKey:ulid(),baseRevision:current.draftRevision,mode:'quick',authorizationId:direction.quickAuthorizationId})).rejects.toThrow('QUICK_AUTHORIZATION_STALE');
 });

 it('pending authorization cannot generate; precise initialization carries it and concurrent consume sends once',async()=>{
  const direction=await armed(),body={directionId:direction.id,requestKey:ulid(),baseRevision:0,mode:'quick',authorizationId:direction.quickAuthorizationId};await expect(prepareGeneration(source.user.id,body)).rejects.toThrow('QUICK_AUTHORIZATION_STALE');
  const ready=await completed(direction);const analysis=(await pool.query('SELECT * FROM analysis_tasks WHERE id=$1',[ready.analysisTaskId])).rows[0];expect(analysis.error_stage).toBeNull();expect(analysis.error_message).toBeNull();await expect(submitAnalysis(source.user.id,{directionId:direction.id,sourceAssetId:source.assetId,requestKey:ulid(),retryOf:ready.analysisTaskId},analysisDeps())).rejects.toThrow('ANALYSIS_RETRY_NOT_ALLOWED');expect(ready.quickState).toBe('armed');expect(ready.draft.control?.intent).toBe('reconstruction');
  const generate=vi.fn(async()=>({mode:'async' as const,externalId:ulid()})),deps:SubmissionDependencies={provider:()=>({name:'replicate',generate}),complete:vi.fn()};
  const request={...body,baseRevision:ready.draftRevision};const results=await Promise.all(Array.from({length:4},()=>submitGeneration(source.user.id,request,deps)));expect(new Set(results.map(r=>r.id)).size).toBe(1);expect(generate).toHaveBeenCalledOnce();expect((await getWorkspaceDirection(source.user.id,direction.id)).direction.quickState).toBe('consumed');
  expect((await pool.query('SELECT count(*)::int AS n FROM generation_tasks WHERE direction_id=$1',[direction.id])).rows[0].n).toBe(1);
 });
 it('editing parameters after arm invalidates epoch and cannot consume after late analysis',async()=>{
  const direction=await armed();await patchWorkspaceDirection(source.user.id,direction.id,{requestKey:ulid(),baseRevision:0,changes:[{target:'aspectRatio',key:'',action:'set',before:'1:1',after:'3:4'}]});const ready=await completed(direction);expect(ready.quickState).toBe('none');expect(ready.authorizationEpoch).toBeGreaterThan(direction.authorizationEpoch);await expect(prepareGeneration(source.user.id,{directionId:direction.id,requestKey:ulid(),baseRevision:ready.draftRevision,mode:'quick',authorizationId:direction.quickAuthorizationId})).rejects.toThrow('QUICK_AUTHORIZATION_STALE');
 });
 it('failed analysis clears unused authorization; another activation cannot clear a current one',async()=>{
  const direction=await armed();await expect(workspaceCommand(source.user.id,direction.id,{requestKey:ulid(),action:'clearQuick',baseRevision:0,activationId:ulid()})).rejects.toThrow('QUICK_ACTIVATION_STALE');const deps=analysisDeps();deps.vision.mockRejectedValue(new Error('unknown'));await submitAnalysis(source.user.id,{directionId:direction.id,sourceAssetId:source.assetId,requestKey:ulid()},deps);expect((await getWorkspaceDirection(source.user.id,direction.id)).direction.quickState).toBe('none');
 });
 it('refresh invalidation is idempotent and old authorization cannot be replayed',async()=>{
  const direction=await armed(),clear={requestKey:ulid(),action:'clearQuick',baseRevision:0};await workspaceCommand(source.user.id,direction.id,clear);expect((await workspaceCommand(source.user.id,direction.id,clear)).reused).toBe(true);const ready=await completed(direction);await expect(prepareGeneration(source.user.id,{directionId:direction.id,requestKey:ulid(),baseRevision:ready.draftRevision,mode:'quick',authorizationId:direction.quickAuthorizationId})).rejects.toThrow('QUICK_AUTHORIZATION_STALE');
 });
});
