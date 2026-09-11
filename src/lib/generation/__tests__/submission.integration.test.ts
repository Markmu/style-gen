import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {and,eq} from 'drizzle-orm';
import {ulid} from 'ulid';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from '../../../../e2e/helpers/workspace-db';
import {db} from '@/lib/db';
import {generationTasks,workspaceEvents} from '@/lib/db/schema';
import {createWorkspaceDirection,getWorkspaceDirection,patchWorkspaceDirection} from '@/lib/workspace/service';
import {getRetrySummary,dispatchGeneration,findSubmissionByKey,prepareGeneration,submitGeneration,type SubmissionDependencies} from '../submission';
import {reservePaidOperation} from '@/lib/ai/cost-guard';
import {withWorkspaceTransaction} from '@/lib/repositories/workspace-repository';
const pool=workspaceTestPool();let source:Awaited<ReturnType<typeof seedWorkspaceSources>>;
beforeEach(async()=>{source=await seedWorkspaceSources(pool);vi.stubEnv('AI_APPROVED_MODEL_BINDINGS','replicate:black-forest-labs/flux-2-dev');vi.stubEnv('REPLICATE_API_TOKEN','test-only');vi.stubEnv('IMAGE_GEN_PROVIDER','replicate');});
afterEach(async()=>{await cleanupWorkspaceUser(pool,source.user.id);vi.unstubAllEnvs();});afterAll(()=>pool.end());
async function request(){const {direction}=await createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'test',sourceKind:'analysis',sourceId:source.analysisId});const detail=await getWorkspaceDirection(source.user.id,direction.id);return {requestKey:ulid(),directionId:direction.id,baseRevision:0,mode:'current',summaryToken:detail.summaryToken};}
function external(generate=vi.fn(async()=>({mode:'async' as const,externalId:ulid()}))){return {generate,deps:{provider:()=>({name:'replicate',generate}),complete:vi.fn()} as SubmissionDependencies};}
describe('real DB submission',()=>{
 it('AC-09 concurrent same intent sends once, reserves once and isolates later edits',async()=>{
  const body=await request(),{deps,generate}=external();
  const results=await Promise.all(Array.from({length:6},()=>submitGeneration(source.user.id,body,deps)));expect(new Set(results.map(r=>r.id)).size).toBe(1);expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][0].prompt).toBe('a real source prompt');
  await patchWorkspaceDirection(source.user.id,body.directionId,{requestKey:ulid(),baseRevision:0,changes:[{target:'customPrompt',key:'',action:'set',before:'a real source prompt',after:'new draft'}]});
  const stored=await findSubmissionByKey(source.user.id,body.requestKey);expect(stored!.promptSnapshot).toBe('a real source prompt');expect(stored!.reservedCostUsd).toBe('0.200000');expect(stored!.params.model).toBe('flux-2-dev');
  expect((await submitGeneration(source.user.id,{...body,summaryToken:'expired'},deps)).id).toBe(stored!.id);expect(generate).toHaveBeenCalledTimes(1);
  const receipts=await db.select().from(workspaceEvents).where(and(eq(workspaceEvents.directionId,body.directionId),eq(workspaceEvents.kind,'generation')));expect(receipts).toHaveLength(1);expect(receipts[0].reservedCostUsd).toBe('0.000000');
 });
 it('AC-08 missing configuration, stale revision, quality, proposals and budget reject before external call',async()=>{
  const body=await request(),{deps,generate}=external();
  await expect(submitGeneration(source.user.id,{...body,baseRevision:1},deps)).rejects.toThrow('revision_conflict');
  vi.stubEnv('REPLICATE_API_TOKEN','');await expect(submitGeneration(source.user.id,body,deps)).rejects.toThrow('MODEL_UNAVAILABLE');vi.stubEnv('REPLICATE_API_TOKEN','test-only');
  vi.stubEnv('AI_DAILY_BUDGET_USD','0.1');await expect(submitGeneration(source.user.id,body,deps)).rejects.toThrow('BUDGET_BLOCKED');vi.stubEnv('AI_DAILY_BUDGET_USD','10');
  await pool.query("INSERT INTO workspace_events(id,direction_id,user_id,sequence,request_key,request_hash,kind,proposal_state) VALUES($1,$2,$3,2,$4,'hash','turn','pending')",[ulid(),body.directionId,source.user.id,ulid()]);
  await expect(submitGeneration(source.user.id,body,deps)).rejects.toThrow('RESOLVE_PROPOSAL');expect(generate).not.toHaveBeenCalled();expect(await findSubmissionByKey(source.user.id,body.requestKey)).toBeNull();
 });
 it('AC-20 uncertain acceptance never sends again, keeps cost and rejects another key',async()=>{
  const body=await request(),generate=vi.fn(async()=>{throw new Error('lost response');}),{deps}=external(generate);
  const first=await submitGeneration(source.user.id,body,deps);expect(first.submissionState).toBe('unknown');
  const task=(await findSubmissionByKey(source.user.id,body.requestKey))!;await dispatchGeneration(task,deps);await submitGeneration(source.user.id,body,deps);
  await expect(submitGeneration(source.user.id,{...body,requestKey:ulid()},deps)).rejects.toThrow('WAIT_FOR_TASK');expect(generate).toHaveBeenCalledTimes(1);expect(task.reservedCostUsd).toBe('0.200000');
 });
 it('sync completion is awaited before returning',async()=>{
  const body=await request();let release!:()=>void;const transfer=new Promise<void>(r=>release=r);
  const deps:SubmissionDependencies={provider:()=>({name:'replicate',generate:async()=>({mode:'sync',imageUrl:'https://fal.media/test.webp',width:1,height:1})}),complete:async({taskId})=>{await transfer;await db.update(generationTasks).set({status:'completed'}).where(eq(generationTasks.id,taskId));return true;}};
  let returned=false;const running=submitGeneration(source.user.id,body,deps).then(v=>{returned=true;return v;});
  await vi.waitFor(async()=>expect((await findSubmissionByKey(source.user.id,body.requestKey))?.outputUrl).toBe('https://fal.media/test.webp'));expect(returned).toBe(false);release();expect((await running).status).toBe('completed');
 });
 it('failed output transfer retains descriptor and reservation without repeating provider',async()=>{
  const body=await request(),generate=vi.fn(async()=>({mode:'sync' as const,imageUrl:'https://fal.media/durable.webp',width:10,height:20}));
  const deps:SubmissionDependencies={provider:()=>({name:'replicate',generate}),complete:async()=>{throw new Error('R2 unavailable');}};
  const first=await submitGeneration(source.user.id,body,deps);expect(first.submissionState).toBe('unknown');expect(first.status).toBe('processing');
  const task=(await findSubmissionByKey(source.user.id,body.requestKey))!;expect(task.outputUrl).toBe('https://fal.media/durable.webp');expect(task.reservedCostUsd).toBe('0.200000');
  await submitGeneration(source.user.id,body,deps);expect(generate).toHaveBeenCalledTimes(1);
 });
 it('distinct concurrent directions atomically compete for the last global budget slot',async()=>{
  const one=await request(),two=await request();vi.stubEnv('AI_DAILY_BUDGET_USD','0.3');
  const results=await Promise.allSettled([prepareGeneration(source.user.id,one),prepareGeneration(source.user.id,two)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const sum=await pool.query('SELECT sum(reserved_cost_usd) AS cost FROM generation_tasks WHERE user_id=$1',[source.user.id]);expect(Number(sum.rows[0].cost)).toBe(.2);
 });
 it('legacy intent participates in shared DB budget and analysis lock',async()=>{
  const body={requestKey:ulid(),analysisTaskId:source.analysisId,promptText:'legacy edited prompt',negativePromptText:'',params:{aspectRatio:'1:1',quality:'standard'}}, {deps,generate}=external();
  const result=await submitGeneration(source.user.id,body,deps);expect(result.submissionState).toBe('submitted');
  await expect(submitGeneration(source.user.id,{...body,requestKey:ulid()},deps)).rejects.toThrow('WAIT_FOR_TASK');expect(generate).toHaveBeenCalledTimes(1);
 });
 it('rolling hour does not reset at UTC month boundary',async()=>{
  const now=new Date('2026-10-01T00:10:00Z');
  await pool.query("INSERT INTO generation_tasks(id,analysis_task_id,user_id,status,prompt_snapshot,negative_prompt_snapshot,params,model_name,reserved_cost_usd,created_at) SELECT lpad(i::text,26,'x'),$1,$2,'completed','p','n','{}','test',.2,'2026-09-30T23:50:00Z' FROM generate_series(1,20)i",[source.analysisId,source.user.id]);
  await expect(withWorkspaceTransaction(source.user.id,null,tx=>reservePaidOperation(tx,source.user.id,'generation',now))).rejects.toThrow('RATE_LIMITED');
 });
 it('retryOriginal reuses exact binding despite environment preference change',async()=>{
  const body=await request(),prepared=await prepareGeneration(source.user.id,body);
  await db.update(generationTasks).set({status:'failed',dispatchState:'terminal'}).where(eq(generationTasks.id,prepared.task.id));
  vi.stubEnv('IMAGE_GEN_PROVIDER','fal');
  await pool.query("UPDATE workspace_directions SET draft=jsonb_set(draft,'{params,model}','\"retired-current-model\"') WHERE id=$1",[body.directionId]);
  const detail=await getRetrySummary(source.user.id,prepared.task.id);expect(detail).not.toBeNull();
  await expect(prepareGeneration(source.user.id,{...body,requestKey:ulid(),mode:'retryOriginal',retryOf:prepared.task.id})).rejects.toThrow('SUMMARY_STALE');
  const next=await prepareGeneration(source.user.id,{...body,requestKey:ulid(),mode:'retryOriginal',retryOf:prepared.task.id,summaryToken:detail!.summaryToken});
  expect(next.task.provider).toBe('replicate');for(const field of ['promptSnapshot','negativePromptSnapshot','params','recipeSnapshot','variablesSnapshot','promptControlSnapshot','modelName'] as const)expect(next.task[field]).toEqual(prepared.task[field]);
 });
});
