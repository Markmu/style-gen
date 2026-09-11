import {test,expect} from '@playwright/test';
import {ulid} from 'ulid';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from './helpers/workspace-db';
import {workspaceAuthCookie} from './helpers/auth';
const pool=workspaceTestPool();let source:Awaited<ReturnType<typeof seedWorkspaceSources>>;
test.beforeEach(async({context})=>{source=await seedWorkspaceSources(pool);await context.addCookies([await workspaceAuthCookie(source.user)]);});
test.afterEach(async()=>cleanupWorkspaceUser(pool,source.user.id));test.afterAll(async()=>pool.end());
test('analysis API authenticates ownership, rejects malformed unions, and reads real retained source',async({context})=>{
 const request=context.request;
 const read=await request.get(`/api/analysis/${source.analysisId}`);expect(read.status()).toBe(200);expect(await read.json()).toMatchObject({sourceAssetId:source.assetId,status:'completed',promptText:'a real source prompt'});
 expect((await request.get(`/api/analysis/${ulid()}`)).status()).toBe(404);
 expect((await request.post('/api/analysis',{data:{sourceAssetId:source.assetId,fileUrl:'https://forged.test'}})).status()).toBe(400);
 expect((await request.post('/api/analysis',{data:{sourceAssetId:ulid(),requestKey:ulid()}})).status()).toBe(404);
 const rows=await pool.query('SELECT count(*) FROM analysis_tasks WHERE user_id=$1',[source.user.id]);expect(Number(rows.rows[0].count)).toBe(1);
});
test('analysis API rejects a fresh paid action when model is unavailable without making a task',async({context})=>{
 const request=context.request;
 const result=await request.post('/api/analysis',{data:{sourceAssetId:source.assetId,requestKey:ulid()}});expect(result.status()).toBe(503);expect(await result.json()).toMatchObject({preservedContext:true});
 const rows=await pool.query('SELECT count(*) FROM analysis_tasks WHERE user_id=$1',[source.user.id]);expect(Number(rows.rows[0].count)).toBe(1);
});
