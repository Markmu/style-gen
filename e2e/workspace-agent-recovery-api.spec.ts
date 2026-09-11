import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { ulid } from 'ulid';
import { workspaceAuthCookie } from './helpers/auth';
import { workspaceTestPool, seedWorkspaceSources, cleanupWorkspaceUser } from './helpers/workspace-db';

test('AC-09 AC-19 AC-20 AC-21 durable output read commits once; unknown never resends; ownership enforced',async({playwright,baseURL})=>{
 const pool=workspaceTestPool(),source=await seedWorkspaceSources(pool),foreign=await seedWorkspaceSources(pool);
 const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
 const other=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(foreign.user)],origins:[]}});
 try {
  const direction=(await(await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Recovery',sourceKind:'analysis',sourceId:source.analysisId}})).json()).direction;
  const id=ulid(),assetId=ulid();
  await pool.query("INSERT INTO generation_tasks(id,analysis_task_id,user_id,direction_id,status,dispatch_state,prompt_snapshot,negative_prompt_snapshot,params,model_name,provider,reserved_result_asset_id,output_object_key,output_mime_type,output_width,output_height) VALUES($1,$2,$3,$4,'processing','outputStored','retained','', $5,'black-forest-labs/flux-2-dev','replicate',$6,$7,'image/png',3,2)",[id,source.analysisId,source.user.id,direction.id,JSON.stringify({aspectRatio:'1:1',quality:'standard',model:'flux-2-dev'}),assetId,`generated/${id}/result.png`]);
  expect((await other.get(`/api/generation/${id}`)).status()).toBe(404);
  const reads=await Promise.all([api.get(`/api/generation/${id}`),api.get(`/api/generation/${id}`)]);
  for(const response of reads){expect(response.status()).toBe(200);const detail=await response.json();expect(detail.status).toBe('completed');expect(detail.resultAssetId).toBe(assetId);expect(detail.submissionState).toBe('terminal');}
  expect(Number((await pool.query('SELECT count(*) FROM assets WHERE source_generation_task_id=$1',[id])).rows[0].count)).toBe(1);
  expect(Number((await pool.query("SELECT count(*) FROM workspace_events WHERE direction_id=$1 AND request_key=$2",[direction.id,`result:${id}`])).rows[0].count)).toBe(1);
  const unknown=ulid();await pool.query("INSERT INTO generation_tasks(id,analysis_task_id,user_id,direction_id,status,dispatch_state,prompt_snapshot,negative_prompt_snapshot,params,model_name,provider,deadline_at) VALUES($1,$2,$3,$4,'processing','unknown','unknown','',$5,'black-forest-labs/flux-2-dev','replicate',NOW()-INTERVAL '1 hour')",[unknown,source.analysisId,source.user.id,direction.id,JSON.stringify({aspectRatio:'1:1',quality:'standard',model:'flux-2-dev'})]);
  const active=await(await api.get(`/api/workspace/directions/${direction.id}`)).json();expect(active.activeTask.outputUrl).toBeUndefined();
  const read=await(await api.get(`/api/generation/${unknown}`)).json();expect(read.status).toBe('processing');expect(read.submissionState).toBe('unknown');
  const command={requestKey:ulid(),action:'reconcile',targetId:unknown};
  const response=await api.post(`/api/workspace/directions/${direction.id}/commands`,{data:command});expect(response.status()).toBe(200);expect((await response.json()).task.submissionState).toBe('unknown');
  const callbackTask=ulid();await pool.query("INSERT INTO generation_tasks(id,analysis_task_id,user_id,status,dispatch_state,prompt_snapshot,negative_prompt_snapshot,params,model_name,provider) VALUES($1,$2,$3,'processing','submitting','callback','',$4,'black-forest-labs/flux-2-dev','replicate')",[callbackTask,source.analysisId,source.user.id,JSON.stringify({aspectRatio:'1:1',quality:'standard',model:'flux-2-dev'})]);
  const payload=JSON.stringify({id:'exact-prediction',webhook:`https://app.example.test/api/webhooks/replicate?taskType=generation&taskId=${callbackTask}`,model:'black-forest-labs/flux-2-dev',status:'failed',output:null,error:'rejected'}),hookId=ulid(),timestamp=String(Math.floor(Date.now()/1000));
  const headers={'content-type':'application/json','webhook-id':hookId,'webhook-timestamp':timestamp,'webhook-signature':`v1,${createHmac('sha256',Buffer.from(process.env.REPLICATE_WEBHOOK_SECRET!.replace('whsec_',''),'base64')).update(`${hookId}.${timestamp}.${payload}`).digest('base64')}`};
  const endpoint=`/api/webhooks/replicate?taskType=generation&taskId=${callbackTask}`;
  expect((await api.post(endpoint,{headers:{...headers,'webhook-signature':'v1,invalid'},data:payload})).status()).toBe(401);
  expect((await api.post(endpoint,{headers,data:payload})).status()).toBe(200);expect((await api.post(endpoint,{headers,data:payload})).status()).toBe(200);
  const failed=await(await api.get(`/api/generation/${callbackTask}`)).json();expect(failed.status).toBe('failed');expect(failed.submissionState).toBe('terminal');
  expect((await other.post(`/api/workspace/directions/${direction.id}/commands`,{data:command})).status()).toBe(404);
 }finally{await api.dispose();await other.dispose();await cleanupWorkspaceUser(pool,source.user.id);await cleanupWorkspaceUser(pool,foreign.user.id);await pool.end();}
});
