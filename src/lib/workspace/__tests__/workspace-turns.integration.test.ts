import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {ulid} from 'ulid';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from '../../../../e2e/helpers/workspace-db';
import {createWorkspaceDirection,getWorkspaceDirection,patchWorkspaceDirection} from '../service';
import {submitWorkspaceTurn,type TurnDependencies} from '../turns';
import {expireAgentTurns} from '../turn-lease';
import {prepareGeneration} from '@/lib/generation/submission';
import type {AgentReply} from '../contracts';
const pool=workspaceTestPool();let source:Awaited<ReturnType<typeof seedWorkspaceSources>>;
beforeEach(async()=>{source=await seedWorkspaceSources(pool);vi.stubEnv('AI_APPROVED_MODEL_BINDINGS','replicate:black-forest-labs/flux-2-dev,replicate:google/gemini-2.5-flash');vi.stubEnv('REPLICATE_API_TOKEN','test-only');vi.stubEnv('IMAGE_GEN_PROVIDER','replicate');vi.stubEnv('STRUCTURER_PROVIDER','replicate');});
afterEach(async()=>{await cleanupWorkspaceUser(pool,source.user.id);vi.unstubAllEnvs();});afterAll(()=>pool.end());
async function setup(){const {direction}=await createWorkspaceDirection(source.user.id,{requestKey:ulid(),title:'conversation',sourceKind:'analysis',sourceId:source.analysisId});return {id:direction.id,body:{requestKey:ulid(),baseRevision:0,text:'Explain the light',references:[],summaryToken:null as string|null}};}
const answer:AgentReply={kind:'answer',text:'An actual response',changes:[],choices:[],evidenceIds:[]};
const proposal:AgentReply={...answer,kind:'proposal',changes:[{target:'customPrompt',key:'',action:'set',before:'a real source prompt',after:'new proposal'}]};
const deps=(reply:AgentReply=answer):TurnDependencies=>({configured:()=>{},interpret:vi.fn(async()=>reply)});
describe('real DB turns',()=>{
 it('AC-03 duplicate in-flight key returns same event, reserves once and releases transaction before inference',async()=>{
  const {id,body}=await setup();let finish!:(v:AgentReply)=>void;const pending=new Promise<AgentReply>(resolve=>finish=resolve),d={...deps(),interpret:vi.fn(()=>pending)};
  const first=submitWorkspaceTurn(source.user.id,id,body,d);await vi.waitFor(async()=>expect((await pool.query('SELECT id FROM workspace_events WHERE request_key=$1',[body.requestKey])).rowCount).toBe(1));
  const duplicate=await submitWorkspaceTurn(source.user.id,id,body,d);expect(duplicate.event.state).toBe('processing');
  await expect(submitWorkspaceTurn(source.user.id,id,{...body,requestKey:ulid()},d)).rejects.toThrow('WAIT_FOR_TURN');
  await patchWorkspaceDirection(source.user.id,id,{requestKey:ulid(),baseRevision:0,changes:[{target:'customPrompt',key:'',action:'set',before:'a real source prompt',after:'changed while interpreting'}]});finish(answer);
  const result=await first;expect(result.event.id).toBe(duplicate.event.id);expect(result.event.state).toBe('completed');expect(d.interpret).toHaveBeenCalledTimes(1);expect(result.event.reservedCostUsd).toBe('0.020000');expect((await getWorkspaceDirection(source.user.id,id)).direction.draft.customPrompt).toBe('changed while interpreting');
 });
 it('AC-04 invalid reference owner and failed iteration never reach inference',async()=>{
  const {id,body}=await setup(),d=deps();const other=await seedWorkspaceSources(pool);
  try{await expect(submitWorkspaceTurn(source.user.id,id,{...body,references:[{kind:'asset',id:other.assetId,analysisTaskId:null}]},d)).rejects.toThrow();}finally{await cleanupWorkspaceUser(pool,other.user.id);}
  await pool.query("UPDATE generation_tasks SET status='failed' WHERE id=$1",[source.iterationId]);
  await expect(submitWorkspaceTurn(source.user.id,id,{...body,references:[{kind:'iteration',id:source.iterationId,analysisTaskId:null}]},d)).rejects.toThrow();expect(d.interpret).not.toHaveBeenCalled();
 });
 it('AC-04/19 invalid proposal before or ID cannot stale an existing valid pending proposal',async()=>{
  const {id,body}=await setup();const first=await submitWorkspaceTurn(source.user.id,id,body,deps(proposal));
  for(const changes of [[{...proposal.changes[0],before:'wrong'}],[{target:'variable',key:'missing',action:'set',before:null,after:'x'}]] as AgentReply['changes'][]){const failed=await submitWorkspaceTurn(source.user.id,id,{...body,requestKey:ulid()},deps({...proposal,changes}));expect(failed.event).toMatchObject({state:'failed',proposalState:'none',responseKind:null,changes:[]});}
  expect((await pool.query('SELECT proposal_state FROM workspace_events WHERE id=$1',[first.event.id])).rows[0].proposal_state).toBe('pending');
 });
 it('AC-03 valid new proposal stales previous pending and never edits draft',async()=>{
  const {id,body}=await setup();const one=await submitWorkspaceTurn(source.user.id,id,body,deps(proposal));const two=await submitWorkspaceTurn(source.user.id,id,{...body,requestKey:ulid()},deps(proposal));expect(two.event.proposalState).toBe('pending');expect((await pool.query('SELECT proposal_state FROM workspace_events WHERE id=$1',[one.event.id])).rows[0].proposal_state).toBe('stale');expect((await getWorkspaceDirection(source.user.id,id)).direction.draft.customPrompt).toBe('a real source prompt');
 });
 it('AC-04 expired-base proposal cannot stale a newer valid proposal',async()=>{
  const {id,body}=await setup();let finish!:(v:AgentReply)=>void;const run=submitWorkspaceTurn(source.user.id,id,body,{...deps(),interpret:()=>new Promise(resolve=>finish=resolve)});await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  await patchWorkspaceDirection(source.user.id,id,{requestKey:ulid(),baseRevision:0,changes:[{target:'customPrompt',key:'',action:'set',before:'a real source prompt',after:'new draft'}]});
  const newerId=ulid();await pool.query("INSERT INTO workspace_events(id,direction_id,user_id,sequence,request_key,request_hash,kind,base_revision,proposal_state) VALUES($1,$2,$3,4,$4,'hash','turn',1,'pending')",[newerId,id,source.user.id,ulid()]);finish(proposal);expect((await run).event.proposalState).toBe('stale');expect((await pool.query('SELECT proposal_state FROM workspace_events WHERE id=$1',[newerId])).rows[0].proposal_state).toBe('pending');
 });
 it('AC-19 read expires lease, late reply is inert and explicit retry uses a new event',async()=>{
  const {id,body}=await setup();let finish!:(v:AgentReply)=>void;const run=submitWorkspaceTurn(source.user.id,id,body,{...deps(),interpret:()=>new Promise(resolve=>finish=resolve)});await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  await pool.query("UPDATE workspace_events SET deadline_at=now()-interval '1 second' WHERE request_key=$1",[body.requestKey]);await getWorkspaceDirection(source.user.id,id);finish(proposal);const failed=await run;expect(failed.event).toMatchObject({state:'failed',errorCode:'AGENT_TIMEOUT',proposalState:'none'});
  const retry=await submitWorkspaceTurn(source.user.id,id,{...body,requestKey:ulid(),retryOf:failed.event.id},deps());expect(retry.event.id).not.toBe(failed.event.id);expect(retry.event.relatedEventId).toBe(failed.event.id);
 });
 it.each(["don't generate now",'He said generate now','First change then generate','请先改成猫再生成'])('AC-10 model claiming render never authorizes %s',async text=>{
  const {id,body}=await setup();const result=await submitWorkspaceTurn(source.user.id,id,{...body,text,summaryToken:(await getWorkspaceDirection(source.user.id,id)).summaryToken},deps({...answer,kind:'render_request'}));expect(result.event.responseKind).toBe('clarify');expect((await pool.query('SELECT id FROM generation_tasks WHERE direction_id=$1',[id])).rowCount).toBe(0);
 });
 it('AC-10 current explicit render requires a displayed summary token',async()=>{
  const {id,body}=await setup();const result=await submitWorkspaceTurn(source.user.id,id,{...body,text:'generate now'},deps({...answer,kind:'render_request'}));expect(result.event.responseKind).toBe('clarify');expect(result.event.generationTaskId).toBeNull();
 });
 it('AC-10 atomically links and completes authorized turn before waiting on image generation, so lease cannot fail it',async()=>{
  const {id,body}=await setup();let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);let taskId='';
  const run=submitWorkspaceTurn(source.user.id,id,{...body,text:'generate now',summaryToken:(await getWorkspaceDirection(source.user.id,id)).summaryToken},{...deps({...answer,kind:'render_request'}),dispatch:async task=>{taskId=task.id;await pending;return task;}});
  await vi.waitFor(()=>expect(taskId).not.toBe(''));const event=(await pool.query('SELECT * FROM workspace_events WHERE request_key=$1',[body.requestKey])).rows[0];expect(event.state).toBe('completed');expect(event.generation_task_id).toBe(taskId);
  await expireAgentTurns(source.user.id,id,undefined,new Date(Date.now()+120000));expect((await pool.query('SELECT state FROM workspace_events WHERE id=$1',[event.id])).rows[0].state).toBe('completed');release();expect((await run).event.generationTaskId).toBe(taskId);
  expect((await submitWorkspaceTurn(source.user.id,id,{...body,text:'generate now',summaryToken:'expired'},deps())).event.id).toBe(event.id);
 });
 it('AC-10 exemption cannot authorize a different event or stale lease',async()=>{
  const {id,body}=await setup();const event=await submitWorkspaceTurn(source.user.id,id,body,deps());await expect(prepareGeneration(source.user.id,{requestKey:ulid(),directionId:id,baseRevision:0,mode:'current',summaryToken:(await getWorkspaceDirection(source.user.id,id)).summaryToken},{eventId:event.event.id,replyText:'fake'})).rejects.toThrow('TURN_AUTHORIZATION_EXPIRED');
 });
});

it('AC-03 preserves actual observation references in the saved reply and reads explicitly referenced older events',async()=>{
 const fixture=await import('../../../../e2e/fixtures/api-responses/analysis-v2-completed.json');
 await pool.query('UPDATE analysis_tasks SET recipe=$1 WHERE id=$2',[JSON.stringify(fixture.recipe),source.analysisId]);
 const {id,body}=await setup();const first=await submitWorkspaceTurn(source.user.id,id,body,deps({...answer,evidenceIds:['lighting_1']}));
 expect(first.event.references).toContainEqual({kind:'evidence',id:'lighting_1',analysisTaskId:source.analysisId});
 const interpret=vi.fn(async()=>answer);await submitWorkspaceTurn(source.user.id,id,{...body,requestKey:ulid(),references:[{kind:'event',id:first.event.id,analysisTaskId:null}]},{configured:()=>{},interpret});
 expect(interpret.mock.calls[0][0].references).toContainEqual(expect.objectContaining({kind:'event',id:first.event.id,inputText:body.text,replyText:answer.text}));
 expect((await pool.query('SELECT "references" FROM workspace_events WHERE id=$1',[first.event.id])).rows[0].references).toContainEqual({kind:'evidence',id:'lighting_1',analysisTaskId:source.analysisId});
});
it('AC-04 two owned images are deduplicated and foreign/deleted evidence never becomes model context',async()=>{
 vi.stubEnv('R2_PUBLIC_URL','https://media.example.test');await pool.query("UPDATE assets SET file_url='https://media.example.test/'||id WHERE user_id=$1",[source.user.id]);
 const {id,body}=await setup(),d=deps();
 await submitWorkspaceTurn(source.user.id,id,{...body,references:[{kind:'asset',id:source.assetId,analysisTaskId:null},{kind:'asset',id:source.assetId,analysisTaskId:null},{kind:'iteration',id:source.iterationId,analysisTaskId:null}]},d);
 expect(vi.mocked(d.interpret).mock.calls[0][0].images.map(image=>image.id)).toEqual([source.assetId,source.resultId]);
 await expect(submitWorkspaceTurn(source.user.id,id,{...body,requestKey:ulid(),references:[{kind:'evidence',id:'missing',analysisTaskId:source.analysisId}]},d)).rejects.toThrow();expect(d.interpret).toHaveBeenCalledTimes(1);
});
it('AC-04 the same observation ID in two analyses cannot be attributed to the wrong source',async()=>{
 const fixture=await import('../../../../e2e/fixtures/api-responses/analysis-v2-completed.json');
 await pool.query('UPDATE analysis_tasks SET recipe=$1 WHERE id=$2',[JSON.stringify(fixture.recipe),source.analysisId]);const oldAnalysis=ulid();await pool.query("INSERT INTO analysis_tasks(id,source_asset_id,user_id,status,recipe,prompt_text) VALUES($1,$2,$3,'completed',$4,'old')",[oldAnalysis,source.assetId,source.user.id,JSON.stringify(fixture.recipe)]);
 const {id,body}=await setup();const result=await submitWorkspaceTurn(source.user.id,id,{...body,references:[{kind:'evidence',id:'lighting_1',analysisTaskId:oldAnalysis}]},deps({...answer,evidenceIds:['lighting_1']}));expect(result.event.state).toBe('failed');expect(result.event.errorCode).toBe('AGENT_OUTPUT_INVALID');expect(result.event.references).toEqual([{kind:'evidence',id:'lighting_1',analysisTaskId:oldAnalysis}]);expect(result.event.replyText).toBeNull();
});
it('same key with changed reference array is rejected while model context alone is deduplicated',async()=>{
 vi.stubEnv('R2_PUBLIC_URL','https://media.example.test');await pool.query("UPDATE assets SET file_url='https://media.example.test/'||id WHERE user_id=$1",[source.user.id]);const {id,body}=await setup(),ref={kind:'asset',id:source.assetId,analysisTaskId:null};
 await submitWorkspaceTurn(source.user.id,id,{...body,references:[ref]},deps());await expect(submitWorkspaceTurn(source.user.id,id,{...body,references:[ref,ref]},deps())).rejects.toThrow('request_key_conflict');
});
it('AC-03 full history and explicitly cited clarification retain choices and reference identities',async()=>{
 const {id,body}=await setup();const first=await submitWorkspaceTurn(source.user.id,id,body,deps({...answer,kind:'clarify',text:'Which one?',choices:['warm','cool']}));
 const interpret=vi.fn(async()=>answer);await submitWorkspaceTurn(source.user.id,id,{...body,requestKey:ulid(),text:'The second one',references:[{kind:'event',id:first.event.id,analysisTaskId:null}]},{configured:()=>{},interpret});
 const context=interpret.mock.calls[0][0];expect(context.history).toContainEqual(expect.objectContaining({id:first.event.id,responseKind:'clarify',replyText:'Which one?',choices:['warm','cool'],references:[]}));expect(context.references).toContainEqual(expect.objectContaining({id:first.event.id,responseKind:'clarify',choices:['warm','cool'],references:[]}));
});
