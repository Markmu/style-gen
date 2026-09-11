import {test,expect} from '@playwright/test';
import {ulid} from 'ulid';
import {workspaceAuthCookie} from './helpers/auth';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from './helpers/workspace-db';
test('AC-02 AC-14 direction pagination never combines shared analysis directions or foreign ownership',async({playwright,baseURL})=>{
 const pool=workspaceTestPool(),source=await seedWorkspaceSources(pool),foreign=await seedWorkspaceSources(pool);
 const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
 try{
 const create=async()=>{const res=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'history',sourceKind:'analysis',sourceId:source.analysisId}});expect(res.status()).toBe(201);return (await res.json()).direction.id as string;};const a=await create(),b=await create();
 await pool.query('UPDATE generation_tasks SET direction_id=$1 WHERE id=$2',[a,source.iterationId]);
 const second=ulid();await pool.query('INSERT INTO generation_tasks(id,user_id,analysis_task_id,direction_id,status,prompt_snapshot,negative_prompt_snapshot,params,model_name,result_asset_id) SELECT $1,user_id,analysis_task_id,$2,status,prompt_snapshot,negative_prompt_snapshot,params,model_name,result_asset_id FROM generation_tasks WHERE id=$3',[second,a,source.iterationId]);
 const excluded=ulid();await pool.query('INSERT INTO generation_tasks(id,user_id,analysis_task_id,direction_id,status,prompt_snapshot,negative_prompt_snapshot,params,model_name,result_asset_id) SELECT $1,user_id,analysis_task_id,$2,status,prompt_snapshot,negative_prompt_snapshot,params,model_name,result_asset_id FROM generation_tasks WHERE id=$3',[excluded,b,source.iterationId]);
 const first=await(await api.get(`/api/generation?directionId=${a}&pageSize=1`)).json();expect(first.items).toHaveLength(1);expect(first.items[0].directionId).toBe(a);expect(first.nextCursor).toBeTruthy();
 const next=await(await api.get(`/api/generation?directionId=${a}&pageSize=1&cursor=${encodeURIComponent(first.nextCursor)}`)).json();expect(next.items).toHaveLength(1);expect(next.items[0].id).not.toBe(first.items[0].id);expect(next.items[0].directionId).toBe(a);
 expect((await(await api.get(`/api/generation?directionId=${b}&cursor=${encodeURIComponent(first.nextCursor)}`)).json()).items).toEqual([]);
 expect((await api.get('/api/generation?directionId='+ulid())).status()).toBe(404);
 const other=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(foreign.user)],origins:[]}});expect((await other.get(`/api/generation?directionId=${a}`)).status()).toBe(404);await other.dispose();
 const restored=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'continue',sourceKind:'iteration',sourceId:source.iterationId}});expect(restored.status()).toBe(201);expect((await restored.json()).direction.sourceIterationId).toBe(source.iterationId);
 expect((await pool.query('SELECT direction_id FROM generation_tasks WHERE id=$1',[source.iterationId])).rows[0].direction_id).toBe(a);
 }finally{await api.dispose();await cleanupWorkspaceUser(pool,source.user.id);await cleanupWorkspaceUser(pool,foreign.user.id);await pool.end();}
});

test('AC-13 AC-16 continues exact frozen prompt and controls, missing model and invalid ratio require explicit repair',async({playwright,baseURL})=>{
 const pool=workspaceTestPool(),source=await seedWorkspaceSources(pool);const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
 try{
 const controls={schemaVersion:1,trigger:'manual',intent:'reconstruction',detailLevel:'standard',editorMode:'variables',customPromptDirty:false,enabledInvariantIds:[],variableValues:{subject:'frozen subject'},enabledModifierNames:[],modifierValues:{},adjustments:[]};const params={aspectRatio:'unsupported-old-ratio',quality:'hd'};
 await pool.query('UPDATE generation_tasks SET prompt_snapshot=$1,negative_prompt_snapshot=$2,prompt_control_snapshot=$3,params=$4 WHERE id=$5',['Exact frozen rendered text','exact frozen negative',JSON.stringify(controls),JSON.stringify(params),source.iterationId]);
 const result=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'frozen continuation',sourceKind:'iteration',sourceId:source.iterationId}});expect(result.status()).toBe(201);const direction=(await result.json()).direction;expect(direction.draft.customPrompt).toBe('Exact frozen rendered text');expect(direction.draft.control).toEqual(controls);expect(direction.draft.params).toEqual({...params,model:''});expect(direction.draft.negativePromptText).toBe('exact frozen negative');
 const read=await(await api.get('/api/workspace/directions/'+direction.id)).json();expect(read.readiness.canGenerate).toBe(false);
 const fixed=await api.patch('/api/workspace/directions/'+direction.id,{data:{requestKey:ulid(),baseRevision:0,changes:[{target:'model',key:'',action:'set',before:'',after:'flux-2-dev'},{target:'aspectRatio',key:'',action:'set',before:'unsupported-old-ratio',after:'3:4'},{target:'quality',key:'',action:'set',before:'hd',after:'standard'}]}});expect(fixed.status()).toBe(200);expect((await fixed.json()).direction.draftRevision).toBe(1);
 const original=(await pool.query('SELECT params,prompt_snapshot,prompt_control_snapshot FROM generation_tasks WHERE id=$1',[source.iterationId])).rows[0];expect(original.params).toEqual(params);expect(original.prompt_snapshot).toBe('Exact frozen rendered text');expect(original.prompt_control_snapshot).toEqual(controls);
 }finally{await api.dispose();await cleanupWorkspaceUser(pool,source.user.id);await pool.end();}
});
