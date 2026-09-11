import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { workspaceAuthCookie } from './helpers/auth';
import { workspaceTestPool, seedWorkspaceSources, cleanupWorkspaceUser } from './helpers/workspace-db';

const hash=(input:Record<string,unknown>)=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(input).filter(([k])=>k!=='summaryToken').sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
test('AC-08 AC-09 AC-20 fixed submission receipts, busy admission and unknown recovery through real API',async({playwright,baseURL})=>{
 const pool=workspaceTestPool(),source=await seedWorkspaceSources(pool),foreign=await seedWorkspaceSources(pool);
 const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});
 try {
  expect((await(await api.get('/api/auth/session')).json()).user.id).toBe(source.user.id);
  const response=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Submission',sourceKind:'analysis',sourceId:source.analysisId}});expect(response.status()).toBe(201);
  const direction=(await response.json()).direction;
  const key=ulid(),id=ulid(),body={requestKey:key,directionId:direction.id,baseRevision:0,mode:'current'};
  await pool.query("INSERT INTO generation_tasks(id,analysis_task_id,user_id,direction_id,request_key,request_hash,draft_revision,status,dispatch_state,prompt_snapshot,negative_prompt_snapshot,params,model_name,provider,reserved_cost_usd,attempted_at) VALUES($1,$2,$3,$4,$5,$6,0,'processing','unknown','fixed accepted prompt','',$7,'black-forest-labs/flux-2-dev','replicate',0.2,NOW())",[id,source.analysisId,source.user.id,direction.id,key,hash(body),JSON.stringify({aspectRatio:'1:1',quality:'standard',model:'flux-2-dev'})]);
  const repeated=await api.post('/api/generation',{data:{...body,summaryToken:'expired-token'}});expect(repeated.status()).toBe(200);expect((await repeated.json()).id).toBe(id);
  const lookup=await api.get(`/api/generation?requestKey=${key}`);expect(lookup.status()).toBe(200);const receipt=await lookup.json();expect(receipt.task.id).toBe(id);expect(receipt.task.submissionState).toBe('unknown');
  expect((await api.get(`/api/generation?requestKey=${key}&view=direction`)).status()).toBe(400);
  expect((await api.post('/api/generation',{data:{...body,baseRevision:1,summaryToken:'expired-token'}})).status()).toBe(409);
  const read=await(await api.get(`/api/workspace/directions/${direction.id}`)).json();expect(read.readiness.canGenerate).toBe(false);
  expect((await api.post('/api/generation',{data:{...body,requestKey:ulid(),summaryToken:read.summaryToken}})).status()).toBe(409);
  const detail=await(await api.get(`/api/generation/${id}`)).json();expect(detail.directionId).toBe(direction.id);expect(detail.submissionState).toBe('unknown');expect(detail.promptSnapshot).toBe('fixed accepted prompt');
  const foreignApi=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(foreign.user)],origins:[]}});
  expect((await foreignApi.get(`/api/generation/${id}`)).status()).toBe(404);await foreignApi.dispose();
  const legacy=await(await api.get(`/api/generation/${source.iterationId}`)).json();expect(legacy.promptSnapshot).toBe('a fixed original prompt');expect(legacy.submissionState).toBeNull();
  const feed=await(await api.get(`/api/generation?view=direction&directionId=${direction.id}`)).json();expect(feed.active.id).toBe(id);
  const emptyResponse=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Empty',sourceKind:'empty'}});const empty=(await emptyResponse.json()).direction;
  const emptyRead=await(await api.get(`/api/workspace/directions/${empty.id}`)).json();expect(emptyRead.readiness.canGenerate).toBe(false);
  const emptyBody={requestKey:ulid(),directionId:empty.id,baseRevision:0,mode:'current',summaryToken:emptyRead.summaryToken};
  const missing=await api.post('/api/generation',{data:emptyBody});expect(missing.status()).toBe(409);expect((await missing.json()).code).toBe('ANALYSIS_REQUIRED');
  const stale=await api.post('/api/generation',{data:{...emptyBody,baseRevision:1}});expect(stale.status()).toBe(409);expect((await stale.json()).code).toBe('revision_conflict');
  const badToken=await api.post('/api/generation',{data:{...emptyBody,summaryToken:'forged'}});expect(badToken.status()).toBe(409);expect((await badToken.json()).code).toBe('SUMMARY_INVALID');
  const count=await pool.query('SELECT count(*),sum(reserved_cost_usd) as reserved FROM generation_tasks WHERE request_key=$1',[key]);expect(Number(count.rows[0].count)).toBe(1);expect(Number(count.rows[0].reserved)).toBe(0.2);
 }finally{await api.dispose();await cleanupWorkspaceUser(pool,source.user.id);await cleanupWorkspaceUser(pool,foreign.user.id);await pool.end();}
});
