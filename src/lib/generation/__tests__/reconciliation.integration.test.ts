import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import {createHash} from 'node:crypto';
import {reconcileManual} from '../../../../scripts/reconcile-generation.mjs';
import {ulid} from 'ulid';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from '../../../../e2e/helpers/workspace-db';
import {db} from '@/lib/db';
import {generationTasks} from '@/lib/db/schema';
import {createWorkspaceDirection,getWorkspaceDirection} from '@/lib/workspace/service';
import {getRetrySummary,dispatchGeneration,prepareGeneration,submitGeneration,type SubmissionDependencies} from '../submission';
import {acceptPrediction,reconcileGeneration,recoverOutput,type RecoveryTransport} from '../reconciliation';
import {inlineDescriptor} from '../output';
const pool=workspaceTestPool();let source:Awaited<ReturnType<typeof seedWorkspaceSources>>;
beforeEach(async()=>{source=await seedWorkspaceSources(pool);vi.stubEnv('AI_APPROVED_MODEL_BINDINGS','replicate:black-forest-labs/flux-2-dev');vi.stubEnv('REPLICATE_API_TOKEN','test-only');vi.stubEnv('IMAGE_GEN_PROVIDER','replicate');});
afterEach(async()=>{await cleanupWorkspaceUser(pool,source.user.id);vi.unstubAllEnvs();});afterAll(()=>pool.end());
async function prepared(){const {direction}=await createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'Recovery',sourceKind:'analysis',sourceId:source.analysisId});const detail=await getWorkspaceDirection(source.user.id,direction.id);return (await prepareGeneration(source.user.id,{requestKey:ulid(),directionId:direction.id,baseRevision:0,mode:'current',summaryToken:detail.summaryToken})).task;}
const png=()=>Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVR4nGP4z8AAQVDqPwMDAEHSBfsl0XwmAAAAAElFTkSuQmCC','base64');
function external(){const objects=new Map<string,{metadata:Record<string,string>;contentType:string;size:number}>();return {objects,deps:{query:vi.fn(async()=>null),head:vi.fn(async(key:string)=>objects.get(key)??null),put:vi.fn(async(key:string,bytes:Buffer|Uint8Array,mime:string,options?:{metadata?:Record<string,string>})=>{objects.set(key,{metadata:options?.metadata??{},contentType:mime,size:bytes.length});}),read:vi.fn(async()=>png()),publicUrl:(key:string)=>`https://media.example.test/${key}`} satisfies RecoveryTransport};}
const evidence=(taskId:string,id=ulid())=>({id,webhook:`https://app.example.test/api/webhooks/replicate?taskType=generation&taskId=${taskId}`,model:'black-forest-labs/flux-2-dev',status:'succeeded',output:'https://replicate.delivery/output.png'});
describe('real DB reconciliation with counted external boundaries',()=>{
 it('AC-20 manual no-query support evidence is exact, audited, read-only by default and releases only confirmed rejection',async()=>{
  const task=await prepared(),attemptedAt=new Date().toISOString();await pool.query("UPDATE generation_tasks SET provider='gemini',status='processing',dispatch_state='unknown',attempted_at=$2 WHERE id=$1",[task.id,attemptedAt]);
  const record={taskId:task.id,provider:'gemini',model:task.modelName,requestKey:task.requestKey,attemptedAt,externalId:null,outcome:'not_accepted',source:'https://support.google.com/ticket/test-only',ticketId:'test-only',confirmation:'confirmed',charged:false};
  const artifact=Buffer.from(JSON.stringify(record));const proof={...record,operator:'fixture-operator',observedAt:new Date().toISOString(),artifactSha256:createHash('sha256').update(artifact).digest('hex'),attestation:'I verified this provider record identifies this exact submission and confirms this outcome'};
  const client=await pool.connect(),fetcher=vi.fn();
  try{
   expect((await reconcileManual({taskId:task.id},client,fetcher)).submissionState).toBe('unknown');expect(fetcher).not.toHaveBeenCalled();
   await expect(reconcileManual({taskId:task.id,apply:true,operator:'fixture-operator',evidence:{...proof,requestKey:'wrong'},artifact},client,fetcher)).rejects.toThrow();
   await expect(reconcileManual({taskId:task.id,apply:true,operator:'fixture-operator',evidence:proof,artifact:Buffer.from('forged')},client,fetcher)).rejects.toThrow();
   expect((await reconcileManual({taskId:task.id,apply:true,operator:'fixture-operator',evidence:proof,artifact},client,fetcher)).submissionState).toBe('terminal');
   const [stored]=await db.select().from(generationTasks).where(eq(generationTasks.id,task.id));expect(stored.status).toBe('failed');expect(Number(stored.reservedCostUsd)).toBe(0);
   const audit=await pool.query("SELECT input_text FROM workspace_events WHERE generation_task_id=$1 AND request_key LIKE 'reconcile-audit:%'",[task.id]);expect(audit.rows).toHaveLength(1);expect(JSON.parse(audit.rows[0].input_text).artifactSha256).toBe(proof.artifactSha256);expect(fetcher).not.toHaveBeenCalled();
  }finally{client.release();}
 });
 it('AC-19 manual confirmed success requires recoverable output and resumes storage only',async()=>{
  const task=await prepared(),attemptedAt=new Date().toISOString(),{deps}=external();await pool.query("UPDATE generation_tasks SET provider='fal',status='processing',dispatch_state='unknown',attempted_at=$2 WHERE id=$1",[task.id,attemptedAt]);
  const record={taskId:task.id,provider:'fal',model:task.modelName,requestKey:task.requestKey,attemptedAt,externalId:null,outcome:'succeeded',source:'https://fal.ai/support/test-only',ticketId:'test-only',confirmation:'confirmed'};
  const apply=async(outputUrl?:string)=>{const artifact=Buffer.from(JSON.stringify({...record,outputUrl})),proof={...record,operator:'fixture',observedAt:new Date().toISOString(),artifactSha256:createHash('sha256').update(artifact).digest('hex'),attestation:'I verified this provider record identifies this exact submission and confirms this outcome'};return reconcileManual({taskId:task.id,apply:true,operator:'fixture',evidence:proof,artifact},client,vi.fn());};
  const client=await pool.connect();try{await expect(apply()).rejects.toThrow('output missing');expect((await reconcileGeneration(source.user.id,task.id,{},deps)).dispatchState).toBe('unknown');await expect(apply('http://localhost/private')).rejects.toThrow('Invalid Provider output');expect((await apply('https://fal.media/recovered.png')).submissionState).toBe('submitted');expect((await recoverOutput(source.user.id,task.id,deps)).status).toBe('completed');expect(deps.query).not.toHaveBeenCalled();expect(deps.put).toHaveBeenCalledTimes(1);}finally{client.release();}
 });
 it('AC-20 manual known-ID evidence rejects another callback binding and keeps reservation for confirmed failure',async()=>{
  const task=await prepared();await pool.query("UPDATE generation_tasks SET status='processing',dispatch_state='unknown',attempted_at=NOW() WHERE id=$1",[task.id]);
  const proof={taskId:task.id,provider:task.provider,model:task.modelName,externalId:'verified-id',operator:'fixture',observedAt:new Date().toISOString(),source:'https://api.replicate.com/v1/predictions/verified-id',outcome:'failed'};
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({id:'verified-id',model:task.modelName,status:'failed',webhook:'https://app.example.test/api/webhooks/replicate?taskType=generation&taskId=another'}))).mockResolvedValueOnce(new Response(JSON.stringify({id:'verified-id',model:task.modelName,status:'failed',webhook:`https://app.example.test/api/webhooks/replicate?taskType=generation&taskId=${task.id}`})));
  const client=await pool.connect();try{await expect(reconcileManual({taskId:task.id,apply:true,evidence:proof,operator:'fixture'},client,fetcher)).rejects.toThrow('correlation');expect((await reconcileManual({taskId:task.id,apply:true,evidence:proof,operator:'fixture'},client,fetcher)).applied).toBe(true);const [stored]=await db.select().from(generationTasks).where(eq(generationTasks.id,task.id));expect(Number(stored.reservedCostUsd)).toBe(.2);}finally{client.release();}
 });
 it('AC-20 unavailable original binding refuses retry without a new task or Provider call',async()=>{
  const task=await prepared();await pool.query("UPDATE generation_tasks SET status='failed',dispatch_state='terminal',model_name='retired-provider/model' WHERE id=$1",[task.id]);
  expect(await getRetrySummary(source.user.id,task.id)).toBeNull();
  const direction=await getWorkspaceDirection(source.user.id,task.directionId!),generate=vi.fn();
  await expect(submitGeneration(source.user.id,{requestKey:ulid(),directionId:task.directionId,baseRevision:0,mode:'retryOriginal',retryOf:task.id,summaryToken:direction.summaryToken},{provider:()=>({name:'replicate',generate}),complete:vi.fn()})).rejects.toThrow('ORIGINAL_BINDING_UNAVAILABLE');
  expect(generate).not.toHaveBeenCalled();expect(await db.select().from(generationTasks).where(eq(generationTasks.directionId,task.directionId!))).toHaveLength(1);
 });
 it('AC-20 explicit prepared CAS sends once and persistent deadlines are 120s sync / 300s async',async()=>{
  const task=await prepared(),{deps}=external();const started=new Date('2026-09-08T10:00:00Z');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(started);
  try {
   const generate=vi.fn(async()=>({mode:'async' as const,externalId:ulid()})),submission:SubmissionDependencies={provider:()=>({name:'replicate',generate}),complete:vi.fn()};
   await Promise.all(Array.from({length:5},()=>reconcileGeneration(source.user.id,task.id,{explicit:true,submission},deps)));expect(generate).toHaveBeenCalledTimes(1);
   let [row]=await db.select().from(generationTasks).where(eq(generationTasks.id,task.id));expect(row.deadlineAt!.getTime()-started.getTime()).toBe(300_000);
   await pool.query("UPDATE generation_tasks SET dispatch_state='submitting',external_id=NULL WHERE id=$1",[task.id]);
   expect((await reconcileGeneration(source.user.id,task.id,{now:new Date(started.getTime()+299999)},deps)).dispatchState).toBe('submitting');
   expect((await reconcileGeneration(source.user.id,task.id,{now:new Date(started.getTime()+300000)},deps)).dispatchState).toBe('unknown');
   const sync=await prepared();await pool.query("UPDATE generation_tasks SET provider='gemini' WHERE id=$1",[sync.id]);
   const [syncTask]=await db.select().from(generationTasks).where(eq(generationTasks.id,sync.id));
   await dispatchGeneration(syncTask,{provider:()=>({name:'gemini',generate:async()=>{throw new Error('response lost');}}),complete:vi.fn()});
   [row]=await db.select().from(generationTasks).where(eq(generationTasks.id,sync.id));expect(row.deadlineAt!.getTime()-started.getTime()).toBe(120_000);expect(row.status).toBe('processing');
  }finally{vi.useRealTimers();}
 });
 it('AC-09 callback before create response + concurrent read commits exactly one asset and result event',async()=>{
  const task=await prepared(),{deps}=external(),proof=evidence(task.id);
  const generation=vi.fn(async()=>{await acceptPrediction(source.user.id,task.id,proof,deps);return {mode:'async' as const,externalId:proof.id};});
  const result=await dispatchGeneration(task,{provider:()=>({name:'replicate',generate:generation}),complete:vi.fn()});expect(result.status).toBe('completed');expect(result.dispatchState).toBe('terminal');
  await Promise.all([acceptPrediction(source.user.id,task.id,proof,deps),acceptPrediction(source.user.id,task.id,{...proof,status:'failed'},deps),reconcileGeneration(source.user.id,task.id,{},deps)]);
  expect(generation).toHaveBeenCalledTimes(1);expect(Number((await pool.query('SELECT count(*) FROM assets WHERE source_generation_task_id=$1',[task.id])).rows[0].count)).toBe(1);expect(Number((await pool.query('SELECT count(*) FROM workspace_events WHERE request_key=$1',[`result:${task.id}`])).rows[0].count)).toBe(1);
 });
 it('AC-19 R2 success then DB failure recovers with HEAD and never PUTs or generates again',async()=>{
  const task=await prepared(),{deps}=external();await pool.query("UPDATE generation_tasks SET dispatch_state='unknown',status='processing',output_url=$2 WHERE id=$1",[task.id,inlineDescriptor(png().toString('base64'),'image/png')]);
  // Trigger is actual DB fault after PUT, before outputStored. No repository mock.
  await pool.query(`CREATE FUNCTION recovery_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${task.id}' AND NEW.dispatch_state='outputStored' THEN RAISE EXCEPTION 'injected after R2'; END IF; RETURN NEW; END $$; CREATE TRIGGER recovery_fault BEFORE UPDATE ON generation_tasks FOR EACH ROW EXECUTE FUNCTION recovery_fault()`);
  try{await expect(recoverOutput(source.user.id,task.id,deps)).rejects.toThrow();}finally{await pool.query('DROP TRIGGER recovery_fault ON generation_tasks; DROP FUNCTION recovery_fault()');}
  expect(deps.put).toHaveBeenCalledTimes(1);expect((await recoverOutput(source.user.id,task.id,deps)).status).toBe('completed');expect(deps.put).toHaveBeenCalledTimes(1);expect(deps.read).toHaveBeenCalledTimes(1);expect(deps.query).not.toHaveBeenCalled();
 });
 it('AC-20 accepted external request with failed ID write remains unknown, then exact callback repairs identity',async()=>{
  const task=await prepared(),{deps}=external(),proof=evidence(task.id);
  await pool.query(`CREATE FUNCTION identity_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${task.id}' AND NEW.external_id IS NOT NULL THEN RAISE EXCEPTION 'injected ID write'; END IF; RETURN NEW; END $$; CREATE TRIGGER identity_fault BEFORE UPDATE ON generation_tasks FOR EACH ROW EXECUTE FUNCTION identity_fault()`);
  const generate=vi.fn(async()=>({mode:'async' as const,externalId:proof.id})),submission:SubmissionDependencies={provider:()=>({name:'replicate',generate}),complete:vi.fn()};
  try{expect((await dispatchGeneration(task,submission)).dispatchState).toBe('unknown');}finally{await pool.query('DROP TRIGGER identity_fault ON generation_tasks; DROP FUNCTION identity_fault()');}
  await dispatchGeneration(task,submission);expect(generate).toHaveBeenCalledTimes(1);
  expect((await acceptPrediction(source.user.id,task.id,proof,deps)).status).toBe('completed');
 });
 it('AC-20 before-CAS DB fault never sends; after-CAS crash never resends',async()=>{
  const task=await prepared(),generate=vi.fn(async()=>({mode:'async' as const,externalId:ulid()})),submission:SubmissionDependencies={provider:()=>({name:'replicate',generate}),complete:vi.fn()};
  await pool.query(`CREATE FUNCTION cas_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${task.id}' AND NEW.dispatch_state='submitting' THEN RAISE EXCEPTION 'injected CAS'; END IF; RETURN NEW; END $$; CREATE TRIGGER cas_fault BEFORE UPDATE ON generation_tasks FOR EACH ROW EXECUTE FUNCTION cas_fault()`);
  try{await expect(dispatchGeneration(task,submission)).rejects.toThrow();expect(generate).not.toHaveBeenCalled();}finally{await pool.query('DROP TRIGGER cas_fault ON generation_tasks; DROP FUNCTION cas_fault()');}
  await pool.query("UPDATE generation_tasks SET status='processing',dispatch_state='submitting',deadline_at=NOW()-INTERVAL '1 hour' WHERE id=$1",[task.id]);
  await dispatchGeneration(task,submission);const {deps}=external();const read=await reconcileGeneration(source.user.id,task.id,{explicit:true},deps);expect(read.status).toBe('processing');expect(generate).not.toHaveBeenCalled();
 });
 it('AC-20 AC-21 concurrent known-ID reads throttle GET queries to at least 5 seconds',async()=>{
  const task=await prepared(),{deps}=external(),now=new Date('2026-09-08T10:00:00Z');await pool.query("UPDATE generation_tasks SET dispatch_state='submitted',status='processing',external_id='known' WHERE id=$1",[task.id]);
  await Promise.all(Array.from({length:8},()=>reconcileGeneration(source.user.id,task.id,{now},deps)));expect(deps.query).toHaveBeenCalledTimes(1);
  await reconcileGeneration(source.user.id,task.id,{now:new Date(now.getTime()+4999)},deps);expect(deps.query).toHaveBeenCalledTimes(1);await reconcileGeneration(source.user.id,task.id,{now:new Date(now.getTime()+5000)},deps);expect(deps.query).toHaveBeenCalledTimes(2);
 });
 it('AC-09 binding mismatch and failure arriving after saved success descriptor cannot destroy success',async()=>{
  const task=await prepared(),{deps}=external(),proof=evidence(task.id);await pool.query("UPDATE generation_tasks SET dispatch_state='submitting',status='processing' WHERE id=$1",[task.id]);
  await expect(acceptPrediction(source.user.id,task.id,{...proof,model:'wrong/model'},deps)).rejects.toThrow('PROVIDER_BINDING_MISMATCH');
  await expect(acceptPrediction(source.user.id,task.id,{...proof,webhook:'https://app.example.test/api/webhooks/replicate?taskType=generation&taskId=another-task'},deps)).rejects.toThrow('PROVIDER_BINDING_MISMATCH');
  deps.put.mockRejectedValueOnce(new Error('storage down'));await expect(acceptPrediction(source.user.id,task.id,proof,deps)).rejects.toThrow();
  await expect(acceptPrediction(source.user.id,task.id,{...proof,id:'different'},deps)).rejects.toThrow('PROVIDER_BINDING_MISMATCH');
  const still=await acceptPrediction(source.user.id,task.id,{...proof,status:'failed'},deps);expect(still.status).toBe('processing');expect((await recoverOutput(source.user.id,task.id,deps)).status).toBe('completed');
 });
 it('AC-21 another owner cannot query or repair a known task',async()=>{const task=await prepared(),{deps}=external();await expect(reconcileGeneration('foreign',task.id,{},deps)).rejects.toThrow();expect(deps.query).not.toHaveBeenCalled();expect(deps.head).not.toHaveBeenCalled();});
 it('AC-20 intent transaction rolls back before external call, and committed prepared is query-only',async()=>{
  const task=await prepared(),{deps}=external();expect((await reconcileGeneration(source.user.id,task.id,{},deps)).dispatchState).toBe('prepared');expect(deps.query).not.toHaveBeenCalled();
  const {direction}=await createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'fault',sourceKind:'analysis',sourceId:source.analysisId});const detail=await getWorkspaceDirection(source.user.id,direction.id);const generate=vi.fn();
  await pool.query(`CREATE FUNCTION intent_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.direction_id='${direction.id}' AND NEW.kind='generation' THEN RAISE EXCEPTION 'injected after intent'; END IF; RETURN NEW; END $$; CREATE TRIGGER intent_fault BEFORE INSERT ON workspace_events FOR EACH ROW EXECUTE FUNCTION intent_fault()`);
  try{await expect(submitGeneration(source.user.id,{requestKey:ulid(),directionId:direction.id,baseRevision:0,mode:'current',summaryToken:detail.summaryToken},{provider:()=>({name:'replicate',generate}),complete:vi.fn()})).rejects.toThrow();expect(generate).not.toHaveBeenCalled();expect(await db.select().from(generationTasks).where(eq(generationTasks.directionId,direction.id))).toHaveLength(0);}finally{await pool.query('DROP TRIGGER intent_fault ON workspace_events; DROP FUNCTION intent_fault()');}
 });
});
