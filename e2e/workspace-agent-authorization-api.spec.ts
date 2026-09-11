import {test,expect} from '@playwright/test';
import {ulid} from 'ulid';
import {workspaceAuthCookie} from './helpers/auth';
import {workspaceTestPool,seedWorkspaceSources,cleanupWorkspaceUser} from './helpers/workspace-db';
test('AC-11 real Auth command invalidates only owned quick, repeated clear is a receipt and GET creates no task',async({playwright,baseURL})=>{
 const pool=workspaceTestPool(),source=await seedWorkspaceSources(pool),other=await seedWorkspaceSources(pool);const api=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(source.user)],origins:[]}});const foreign=await playwright.request.newContext({baseURL,storageState:{cookies:[await workspaceAuthCookie(other.user)],origins:[]}});
 try{const created=await api.post('/api/workspace/directions',{data:{requestKey:ulid(),title:'Quick',sourceKind:'empty'}});expect(created.status()).toBe(201);const direction=(await created.json()).direction;await pool.query("UPDATE workspace_directions SET quick_state='armed',quick_authorization_id=$2,quick_activation_id='page-one',authorization_epoch=3 WHERE id=$1",[direction.id,ulid()]);
  const command={requestKey:ulid(),action:'clearQuick',baseRevision:0};expect((await foreign.post(`/api/workspace/directions/${direction.id}/commands`,{data:command})).status()).toBe(404);expect((await api.post(`/api/workspace/directions/${direction.id}/commands`,{data:{...command,activationId:'page-two'}})).status()).toBe(409);
  const result=await api.post(`/api/workspace/directions/${direction.id}/commands`,{data:command});expect(result.status()).toBe(200);expect((await result.json()).direction).toMatchObject({quickState:'none',authorizationEpoch:4});expect((await (await api.post(`/api/workspace/directions/${direction.id}/commands`,{data:command})).json()).reused).toBe(true);
  await api.get(`/api/workspace/directions/${direction.id}`);await api.get('/api/generation?requestKey=never-created');expect((await pool.query('SELECT count(*)::int AS n FROM generation_tasks WHERE direction_id=$1',[direction.id])).rows[0].n).toBe(0);
 }finally{await api.dispose();await foreign.dispose();await cleanupWorkspaceUser(pool,source.user.id);await cleanupWorkspaceUser(pool,other.user.id);await pool.end();}
});
