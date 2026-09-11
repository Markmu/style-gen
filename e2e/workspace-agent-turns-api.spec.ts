import {test,expect} from '@playwright/test';
import {ulid} from 'ulid';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from './helpers/workspace-db';
import {workspaceAuthCookie} from './helpers/auth';
const pool=workspaceTestPool();let source:Awaited<ReturnType<typeof seedWorkspaceSources>>;
test.beforeEach(async({context})=>{source=await seedWorkspaceSources(pool);await context.addCookies([await workspaceAuthCookie(source.user)]);});
test.afterEach(async()=>cleanupWorkspaceUser(pool,source.user.id));test.afterAll(()=>pool.end());
async function direction(request:import('@playwright/test').APIRequestContext){const result=await request.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Agent test',sourceKind:'analysis',sourceId:source.analysisId}});expect(result.status()).toBe(201);return (await result.json()).direction.id;}
test('AC-19 real API stores unavailable-provider failure, returns original receipt and explicit retry linkage',async({context})=>{
 const request=context.request,id=await direction(request),body={requestKey:ulid(),baseRevision:0,text:'Why is the light soft?',references:[],summaryToken:null};
 const failed=await request.post(`/api/workspace/directions/${id}/turns`,{data:body});expect(failed.status()).toBe(503);const result=await failed.json();expect(result).toMatchObject({eventId:expect.any(String),retryable:true,preservedContext:true,event:{state:'failed',inputText:body.text}});
 const read=await request.get(`/api/workspace/directions/${id}/events?requestKey=${body.requestKey}`);expect((await read.json()).event.id).toBe(result.eventId);
 const duplicate=await request.post(`/api/workspace/directions/${id}/turns`,{data:{...body,summaryToken:'expired'}});expect((await duplicate.json()).event.id).toBe(result.eventId);
 const retry=await request.post(`/api/workspace/directions/${id}/turns`,{data:{...body,requestKey:ulid(),retryOf:result.eventId}});const next=await retry.json();expect(next.event.relatedEventId).toBe(result.eventId);expect(next.event.id).not.toBe(result.eventId);
 expect((await pool.query('SELECT draft_revision FROM workspace_directions WHERE id=$1',[id])).rows[0].draft_revision).toBe(0);
});
test('AC-04 real API rejects forged userId, foreign asset, bad retry and changed same-key body',async({context})=>{
 const request=context.request,id=await direction(request),body={requestKey:ulid(),baseRevision:0,text:'Generate now',references:[],summaryToken:null};
 expect((await request.post(`/api/workspace/directions/${id}/turns`,{data:{...body,userId:'forged'}})).status()).toBe(400);
 expect((await request.post(`/api/workspace/directions/${id}/turns`,{data:{...body,references:[{kind:'asset',id:ulid(),analysisTaskId:null}]}})).status()).toBe(404);
 expect((await request.post(`/api/workspace/directions/${id}/turns`,{data:{...body,retryOf:ulid()}})).status()).toBe(409);
 await request.post(`/api/workspace/directions/${id}/turns`,{data:body});expect((await request.post(`/api/workspace/directions/${id}/turns`,{data:{...body,text:'Different'}})).status()).toBe(409);
});
