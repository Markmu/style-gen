import {test,expect} from '@playwright/test';
import fixture from './fixtures/api-responses/analysis-v2-completed.json';
import {ulid} from 'ulid';
import {workspaceAuthCookie} from './helpers/auth';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from './helpers/workspace-db';

test('AC-04 AC-05 AC-06 real proposal atomic apply, inverse receipt, exact Undo and replay',async({playwright,baseURL})=>{
 const pool=workspaceTestPool(),source=await seedWorkspaceSources(pool);
 const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
 try {
  expect((await (await api.get('/api/auth/session')).json()).user.id).toBe(source.user.id);
  const created=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Proposal',sourceKind:'analysis',sourceId:source.analysisId}});expect(created.status()).toBe(201);
  const direction=(await created.json()).direction,id=direction.id,eventId=ulid();
  const changes=[{target:'customPrompt',key:'',action:'set',before:'a real source prompt',after:'repeat repeat'}, {target:'aspectRatio',key:'',action:'set',before:'1:1',after:'3:4'}];
  await pool.query("INSERT INTO workspace_events(id,direction_id,user_id,sequence,request_key,request_hash,kind,state,response_kind,proposal_state,base_revision,changes) VALUES($1,$2,$3,2,$1,'seed','turn','completed','proposal','pending',0,$4)",[eventId,id,source.user.id,JSON.stringify(changes)]);
  const apply={requestKey:ulid(),action:'apply',eventId,baseRevision:0,changes};
  const res=await api.post(`/api/workspace/directions/${id}/commands`,{data:apply});expect(res.status()).toBe(200);
  const applied=await res.json();expect(applied.direction.draft.customPrompt).toBe('repeat repeat');expect(applied.event.inverseChanges.length).toBeGreaterThan(0);expect(applied.event.resultingRevision).toBe(1);
  const undo={requestKey:ulid(),action:'undo',eventId:applied.event.id,baseRevision:1};
  const reverted=await api.post(`/api/workspace/directions/${id}/commands`,{data:undo});expect(reverted.status()).toBe(200);expect((await reverted.json()).direction.draft).toEqual(direction.draft);
  const replay=await api.post(`/api/workspace/directions/${id}/commands`,{data:apply});expect(replay.status()).toBe(200);expect((await replay.json()).reused).toBe(true);
  expect((await api.post(`/api/workspace/directions/${id}/commands`,{data:{...undo,requestKey:ulid(),baseRevision:2}})).status()).toBe(409);
  expect((await pool.query('SELECT count(*)::int AS count FROM generation_tasks WHERE direction_id=$1',[id])).rows[0].count).toBe(0);
 }finally{await api.dispose();await cleanupWorkspaceUser(pool,source.user.id);await pool.end();}
});

test('AC-04 AC-06 invalid proposals rollback, direct edits stale, discard ignores revision, and foreign references fail closed',async({playwright,baseURL})=>{
 const pool=workspaceTestPool(),source=await seedWorkspaceSources(pool),foreign=await seedWorkspaceSources(pool);
 const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
 try{
  const create=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Validation',sourceKind:'analysis',sourceId:source.analysisId}});const direction=(await create.json()).direction,id=direction.id;let sequence=1;
  const patch={target:'customPrompt',key:'',action:'set',before:direction.draft.customPrompt,after:'edited'};
  const seed=async(changes:unknown[],references:unknown[]=[])=>{const eventId=ulid();await pool.query("INSERT INTO workspace_events(id,direction_id,user_id,sequence,request_key,request_hash,kind,state,response_kind,proposal_state,base_revision,changes,\"references\") VALUES($1,$2,$3,$4,$1,'seed','turn','completed','proposal','pending',0,$5,$6)",[eventId,id,source.user.id,++sequence,JSON.stringify(changes),JSON.stringify(references)]);return eventId;};
  const command=async(eventId:string,changes:unknown[])=>api.post(`/api/workspace/directions/${id}/commands`,{data:{requestKey:ulid(),action:'apply',eventId,baseRevision:0,changes}});
  const cases=[Array.from({length:33},(_,i)=>({target:'constraint',key:`new:${i}`,action:'set',before:null,after:'x'})),[patch,patch],[{...patch,target:'variable',key:'__proto__'}],[patch,{target:'variable',key:'missing',action:'set',before:null,after:'x'}],[{...patch,before:'wrong'}]];
  for(const changes of cases){const eventId=await seed(changes);const response=await command(eventId,changes);expect([400,409]).toContain(response.status());const current=(await(await api.get(`/api/workspace/directions/${id}`)).json()).direction;expect(current.draft).toEqual(direction.draft);expect(current.draftRevision).toBe(0);}
  const foreignRef=await seed([patch],[{kind:'asset',id:foreign.assetId,analysisTaskId:null}]);expect((await command(foreignRef,[patch])).status()).toBe(404);
  const invalidEvidence=await seed([patch],[{kind:'evidence',id:'missing',analysisTaskId:source.analysisId}]);expect((await command(invalidEvidence,[patch])).status()).toBe(404);
  const valid=await seed([patch]);expect((await command(valid,[{...patch,target:'negativePrompt',before:'no text'}])).status()).toBe(400);
  const edited=await api.patch(`/api/workspace/directions/${id}`,{data:{requestKey:ulid(),baseRevision:0,changes:[{...patch,after:'latest draft'}]}});expect(edited.status()).toBe(200);
  expect((await command(valid,[patch])).status()).toBe(409);
  const discarded=await api.post(`/api/workspace/directions/${id}/commands`,{data:{requestKey:ulid(),action:'discard',eventId:valid,baseRevision:0}});expect(discarded.status()).toBe(200);expect((await discarded.json()).direction.draft.customPrompt).toBe('latest draft');
  const events=(await(await api.get(`/api/workspace/directions/${id}/events`)).json()).items;expect(events.find((e:{id:string})=>e.id===valid).proposalState).toBe('discarded');expect(events.filter((e:{id:string})=>e.id===foreignRef)[0].proposalState).toBe('stale');
 }finally{await api.dispose();await cleanupWorkspaceUser(pool,source.user.id);await cleanupWorkspaceUser(pool,foreign.user.id);await pool.end();}
});

test('AC-05 exact Undo restores disabled metadata, missing variable and legacy params; bad snapshot fails closed',async({playwright,baseURL})=>{
 const pool=workspaceTestPool(),source=await seedWorkspaceSources(pool);
 const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
 try{
  await pool.query('UPDATE analysis_tasks SET recipe=$1 WHERE id=$2',[JSON.stringify(fixture.recipe),source.analysisId]);
  const created=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Round trip',sourceKind:'analysis',sourceId:source.analysisId}});const direction=(await created.json()).direction,id=direction.id,rule=fixture.recipe.styleInvariants[0],variable=fixture.recipe.contentVariables[0];
  direction.draft.params.quality='hd';direction.draft.control.variableValues={};direction.draft.control.enabledInvariantIds=[];direction.draft.control.adjustments=[{invariantId:rule.id,action:'replace',replacementValue:'old disabled adjustment'}];direction.draft.constraints=['keep','duplicate'];
  await pool.query('UPDATE workspace_directions SET draft=$1 WHERE id=$2',[JSON.stringify(direction.draft),id]);
  const changes=[{target:'variable',key:variable.name,action:'set',before:null,after:'a blue cup'},{target:'invariant',key:rule.id,action:'set',before:null,after:rule.value},{target:'quality',key:'',action:'set',before:'hd',after:'standard'},{target:'constraint',key:'new:test',action:'set',before:null,after:' duplicate '}];
  const eventId=ulid();await pool.query("INSERT INTO workspace_events(id,direction_id,user_id,sequence,request_key,request_hash,kind,state,response_kind,proposal_state,base_revision,changes) VALUES($1,$2,$3,2,$1,'seed','turn','completed','proposal','pending',0,$4)",[eventId,id,source.user.id,JSON.stringify(changes)]);
  const apply={requestKey:ulid(),action:'apply',eventId,baseRevision:0,changes};const [a,b]=await Promise.all([api.post(`/api/workspace/directions/${id}/commands`,{data:apply}),api.post(`/api/workspace/directions/${id}/commands`,{data:apply})]);expect(a.status()).toBe(200);expect(b.status()).toBe(200);const result=await a.json();expect((await b.json()).event.id).toBe(result.event.id);
  const snapshot=(await pool.query('SELECT input_text FROM workspace_events WHERE id=$1',[result.event.id])).rows[0].input_text;
  await pool.query('UPDATE workspace_events SET input_text=$1 WHERE id=$2',['{}',result.event.id]);const undo={requestKey:ulid(),action:'undo',eventId:result.event.id,baseRevision:1};expect((await api.post(`/api/workspace/directions/${id}/commands`,{data:undo})).status()).toBe(409);
  await pool.query('UPDATE workspace_events SET input_text=$1 WHERE id=$2',[snapshot,result.event.id]);const restored=await api.post(`/api/workspace/directions/${id}/commands`,{data:undo});expect(restored.status()).toBe(200);expect((await restored.json()).direction.draft).toEqual(direction.draft);
  const recovery=await api.post(`/api/workspace/directions/${id}/turns`,{data:{requestKey:ulid(),baseRevision:2,text:'Propose restoring these changes against the latest draft',references:[{kind:'event',id:result.event.id,analysisTaskId:null}],summaryToken:null}});expect(recovery.status()).toBe(503);expect(['MODEL_UNAVAILABLE','MODEL_COST_UNAPPROVED']).toContain((await recovery.json()).event.errorCode);
  expect((await pool.query('SELECT count(*)::int AS count FROM generation_tasks WHERE direction_id=$1',[id])).rows[0].count).toBe(0);
 }finally{await api.dispose();await cleanupWorkspaceUser(pool,source.user.id);await pool.end();}
});
