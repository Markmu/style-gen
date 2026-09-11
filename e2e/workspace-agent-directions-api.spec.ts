import { test, expect } from '@playwright/test';
import v2 from './fixtures/api-responses/analysis-v2-completed.json';
import { ulid } from 'ulid';
import { workspaceAuthCookie } from './helpers/auth';
import { workspaceTestPool, seedWorkspaceSources, cleanupWorkspaceUser } from './helpers/workspace-db';

test('AC-02 AC-06 AC-15 AC-16 real directions API ownership, CAS, stable history and recovery', async ({ playwright, baseURL }) => {
  test.setTimeout(180000);
  const pool=workspaceTestPool(); const source=await seedWorkspaceSources(pool); const foreign=await seedWorkspaceSources(pool);
  const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
  try {
    const anonymous=await playwright.request.newContext({baseURL});
    // auth readiness proves infrastructure independently of missing new routes.
    const session=await api.get('/api/auth/session'); expect((await session.json()).user.id).toBe(source.user.id);
    const input={requestKey:ulid(),title:'First direction',sourceKind:'analysis',sourceId:source.analysisId};
    const created=await api.post('/api/workspace/directions',{data:input}); expect(created.status()).toBe(201);
    const direction=(await created.json()).direction; expect(direction.analysisTaskId).toBe(source.analysisId);
    expect(direction.draft.customPrompt).toBe('a real source prompt'); expect(typeof direction.createdAt).toBe('string');
    expect((await anonymous.get(`/api/workspace/directions/${direction.id}`)).status()).toBe(401); await anonymous.dispose();
    for(const [sourceKind,sourceId] of [['iteration',source.iterationId],['template',source.templateId],['empty',undefined]]) {
      const res=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:sourceKind,sourceKind,...(sourceId?{sourceId}:{})}}); expect(res.status()).toBe(201);
      const id=(await res.json()).direction.id;const events=await (await api.get(`/api/workspace/directions/${id}/events`)).json();expect(events.items.every((e:{kind:string})=>e.kind==='restored')).toBe(true);
    }
    const patch={requestKey:ulid(),baseRevision:0,changes:[{target:'customPrompt',key:'',action:'set',before:'a real source prompt',after:'user edited text'}]};
    const edited=await api.patch(`/api/workspace/directions/${direction.id}`,{data:patch});expect(edited.status()).toBe(200);expect((await edited.json()).direction.draftRevision).toBe(1);
    expect((await api.patch(`/api/workspace/directions/${direction.id}`,{data:patch})).status()).toBe(200);
    expect((await api.patch(`/api/workspace/directions/${direction.id}`,{data:{...patch,requestKey:ulid()}})).status()).toBe(409);
    expect((await api.patch(`/api/workspace/directions/${direction.id}`,{data:{...patch,baseRevision:1}})).status()).toBe(409);
    await pool.query('UPDATE analysis_tasks SET prompt_text=$1 WHERE id=$2',['changed later source',source.analysisId]);
    expect((await api.post('/api/workspace/directions',{data:input})).status()).toBe(200);
    expect((await api.post('/api/workspace/directions',{data:{...input,title:'different original'}})).status()).toBe(409);
    const corruptAnalysis=ulid();
    await pool.query('INSERT INTO analysis_tasks(id,source_asset_id,user_id) VALUES($1,$2,$3)',[corruptAnalysis,foreign.assetId,source.user.id]);
    expect((await api.post('/api/workspace/directions',{data:{...input,requestKey:ulid(),sourceId:corruptAnalysis}})).status()).toBe(404);
    await pool.query('DELETE FROM analysis_tasks WHERE id=$1',[corruptAnalysis]);
    const orphanMemory=ulid();await pool.query('INSERT INTO templates(id,name,content,user_id) VALUES($1,$2,$3,$4)',[orphanMemory,'no analysis','editable memory',source.user.id]);
    const orphanResponse=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'orphan memory',sourceKind:'template',sourceId:orphanMemory}});expect(orphanResponse.status()).toBe(201);
    const orphanDirection=(await orphanResponse.json()).direction;expect(orphanDirection.analysisTaskId).toBeNull();
    expect((await (await api.get(`/api/workspace/directions/${orphanDirection.id}`)).json()).readiness.canGenerate).toBe(false);
    expect((await api.patch(`/api/workspace/directions/${direction.id}`,{data:{requestKey:ulid(),baseRevision:1,preferredIterationId:source.iterationId}})).status()).toBe(400);

    for(const id of [foreign.analysisId,ulid()]) expect((await api.post('/api/workspace/directions',{data:{...input,requestKey:ulid(),sourceId:id}})).status()).toBe(404);
    expect((await api.post(`/api/workspace/directions/${direction.id}/commands`,{data:{requestKey:ulid(),action:'restore',baseRevision:1,targetId:foreign.iterationId}})).status()).toBe(404);
    expect((await api.get(`/api/workspace/directions/${direction.id}`)).status()).toBe(200);
    expect((await (await api.get(`/api/workspace/directions/${direction.id}`)).json()).direction.draft.customPrompt).toBe('user edited text');
    const restored=await api.post(`/api/workspace/directions/${direction.id}/commands`,{data:{requestKey:ulid(),action:'restore',baseRevision:1,targetId:source.iterationId}});expect(restored.status()).toBe(200);
    expect((await restored.json()).direction.draft.customPrompt).toBe('a fixed original prompt');
    for(const bad of [{userId:foreign.user.id},{changes:[{target:'__proto__',key:'',action:'set',before:null,after:'x'}]}]) expect((await api.patch(`/api/workspace/directions/${direction.id}`,{data:{requestKey:ulid(),baseRevision:2,...bad}})).status()).toBe(400);
    expect((await api.post(`/api/workspace/directions/${direction.id}/commands`,{data:{requestKey:ulid(),action:'apply',baseRevision:2,eventId:ulid()}})).status()).toBe(400);
    await pool.query("INSERT INTO workspace_events(id,direction_id,user_id,sequence,request_key,request_hash,kind,input_text) SELECT lpad(i::text,26,'0'),$1,$2,i+3,'seed-'||i,'hash','turn','older full input' FROM generate_series(1,1000) i",[direction.id,source.user.id]);
    const first=await(await api.get(`/api/workspace/directions/${direction.id}/events`)).json(); expect(first.items).toHaveLength(20);
    await pool.query("INSERT INTO workspace_events(id,direction_id,user_id,sequence,request_key,request_hash,kind) VALUES($1,$2,$3,1004,'newer','hash','turn')",[ulid(),direction.id,source.user.id]);
    const second=await(await api.get(`/api/workspace/directions/${direction.id}/events?page=2&throughSequence=${first.throughSequence}`)).json();expect(second.items[0].sequence).toBe(first.items[19].sequence-1);expect(second.total).toBe(first.total);
    expect((await api.get(`/api/workspace/directions/${direction.id}/events?requestKey=x&page=1`)).status()).toBe(400);
    const readTimes:number[]=[],writeTimes:number[]=[];
    // Compile/warm both endpoints before recording 100 samples.
    for(let i=0;i<5;i++) await api.get(`/api/workspace/directions/${direction.id}/events`);
    for(let i=0;i<100;i++) {
      let start=performance.now();const read=await api.get(`/api/workspace/directions/${direction.id}/events`);expect(read.status()).toBe(200);readTimes.push(performance.now()-start);
      start=performance.now();const write=await api.patch(`/api/workspace/directions/${direction.id}`,{data:{requestKey:ulid(),baseRevision:i+2,title:`title ${i}`}});expect(write.status()).toBe(200);writeTimes.push(performance.now()-start);
    }
    const p95=(values:number[])=>values.sort((a,b)=>a-b)[94]; console.log(JSON.stringify({metric:'workspace_api_p95_ms',events:1000,samples:100,warmup:5,platform:process.platform,arch:process.arch,page:p95(readTimes),patch:p95(writeTimes)}));
    expect(p95(readTimes)).toBeLessThan(500);expect(p95(writeTimes)).toBeLessThan(500);
  } finally { await api.dispose();await cleanupWorkspaceUser(pool,source.user.id);await cleanupWorkspaceUser(pool,foreign.user.id);await pool.end(); }
});


test('AC-02 AC-06 immutable restored recipe wins over changed analysis, variable edits remain live',async({playwright,baseURL})=>{
  const pool=workspaceTestPool();const source=await seedWorkspaceSources(pool);
  const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
  try {
    const recipe=v2.recipe;
    const control={schemaVersion:1,trigger:'manual',intent:'same_style',detailLevel:'standard',editorMode:'variables',customPromptDirty:false,enabledInvariantIds:recipe.styleInvariants.map(r=>r.id),variableValues:{subject:'amber bottle',environment:'quiet studio table'},enabledModifierNames:[],modifierValues:{},adjustments:[]};
    await pool.query('UPDATE generation_tasks SET recipe_snapshot=$1,prompt_control_snapshot=$2,variables_snapshot=$3 WHERE id=$4',[JSON.stringify(recipe),JSON.stringify(control),JSON.stringify(recipe.contentVariables),source.iterationId]);
    await pool.query('UPDATE analysis_tasks SET recipe=$1,analysis_template_variables=$2 WHERE id=$3',[JSON.stringify({...recipe,contentVariables:[{name:'different',defaultValue:'drifted'}]}),JSON.stringify([{name:'different',defaultValue:'drifted'}]),source.analysisId]);
    await pool.query('UPDATE generation_tasks SET source_template_id=$1 WHERE id=$2',[source.templateId,source.iterationId]);
    const response=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Snapshot',sourceKind:'iteration',sourceId:source.iterationId}});expect(response.status()).toBe(201);
    const direction=(await response.json()).direction;expect(direction.draft.customPrompt).toBe('a fixed original prompt');expect(direction.draft.control?.variableValues.subject).toBe('amber bottle');
    const detail=await(await api.get(`/api/workspace/directions/${direction.id}`)).json();
    expect(detail.source.variables[0].name).toBe('subject');expect(detail.source.recipe.contentVariables[0].name).toBe('subject');expect(detail.source.reference.id).toBe(source.assetId);expect(detail.source.reference.width).toBe(100);
    const edited=await api.patch(`/api/workspace/directions/${direction.id}`,{data:{requestKey:ulid(),baseRevision:0,changes:[{target:'variable',key:'subject',action:'set',before:'amber bottle',after:'ceramic cup'}]}});expect(edited.status()).toBe(200);
    const next=(await edited.json()).direction;expect(next.draft.control.variableValues.subject).toBe('ceramic cup');expect(next.draft.customPrompt).toBe('a fixed original prompt');
    expect((await api.patch(`/api/workspace/directions/${direction.id}`,{data:{requestKey:ulid(),baseRevision:1,changes:[{target:'variable',key:'different',action:'set',before:null,after:'illegal'}]}})).status()).toBe(400);
    await pool.query('UPDATE templates SET content=$1,variables=$2 WHERE id=$3',['memory {{memorySubject}}',JSON.stringify([{name:'memorySubject',defaultValue:'book'}]),source.templateId]);
    const memoryResponse=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Memory own variables',sourceKind:'template',sourceId:source.templateId}});expect(memoryResponse.status()).toBe(201);
    const memory=(await memoryResponse.json()).direction;expect(memory.draft.control.customTemplate).toBe('memory {{memorySubject}}');expect(memory.draft.control.variableValues).toEqual({memorySubject:'book'});
    expect((await api.patch(`/api/workspace/directions/${memory.id}`,{data:{requestKey:ulid(),baseRevision:0,changes:[{target:'variable',key:'memorySubject',action:'set',before:'book',after:'cup'}]}})).status()).toBe(200);
  }finally{await api.dispose();await cleanupWorkspaceUser(pool,source.user.id);await pool.end();}
});
