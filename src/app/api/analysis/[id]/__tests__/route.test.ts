import {beforeEach,describe,expect,it,vi} from 'vitest';
import {GET} from '../route';
import {WorkspaceNotFound} from '@/lib/repositories/workspace-repository';
const mock=vi.hoisted(()=>({auth:vi.fn(),reconcile:vi.fn()}));
vi.mock('@/auth',()=>({auth:mock.auth}));vi.mock('@/lib/analysis/submission',()=>({reconcileAnalysis:mock.reconcile}));
const id='01K1ABCDEFGHJKMNPQRSTVWXYZ';
const get=(value=id)=>GET(new Request('http://localhost/api/analysis/'+value),{params:Promise.resolve({id:value})});
beforeEach(()=>{vi.clearAllMocks();mock.auth.mockResolvedValue({user:{id:'owner'}});});
describe('analysis durable query HTTP boundary',()=>{
 it('requires auth before reading',async()=>{mock.auth.mockResolvedValue(null);expect((await get()).status).toBe(401);expect(mock.reconcile).not.toHaveBeenCalled();});
 it.each(['pending','processing','completed','failed'])('reads %s from owned durable service without inventing terminality',async status=>{mock.reconcile.mockResolvedValue({id,status,rawResponse:'retained'});const response=await get();expect(response.status).toBe(200);expect(await response.json()).toMatchObject({id,status});expect(mock.reconcile).toHaveBeenCalledWith('owner',id);});
 it('invalid IDs are rejected before DB access',async()=>{expect((await get('')).status).toBe(400);expect(mock.reconcile).not.toHaveBeenCalled();});
 it('missing or foreign tasks both return 404',async()=>{mock.reconcile.mockRejectedValue(new WorkspaceNotFound());expect((await get()).status).toBe(404);});
 it('DB outage returns sanitized 503 with preserved context',async()=>{mock.reconcile.mockRejectedValue(new Error('secret connection'));const response=await get();expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'SERVICE_UNAVAILABLE',retryable:true,preservedContext:true});});
});
