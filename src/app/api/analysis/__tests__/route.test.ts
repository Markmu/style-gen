import {beforeEach,describe,expect,it,vi} from 'vitest';
import {POST} from '../route';
import {WorkspaceServiceError} from '@/lib/workspace/validation';
import {WorkspaceNotFound,WorkspaceConflict} from '@/lib/repositories/workspace-repository';
const mock=vi.hoisted(()=>({auth:vi.fn(),submit:vi.fn()}));
vi.mock('@/auth',()=>({auth:mock.auth}));
vi.mock('@/lib/analysis/submission',()=>({submitAnalysis:mock.submit}));
const request=(body:unknown)=>new Request('http://localhost/api/analysis',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mock.auth.mockResolvedValue({user:{id:'authenticated-user'}});});
/** Asset ownership, transactional creation, provider stages and reservation are exercised in analysis.integration.test.ts. */
describe('POST analysis HTTP boundary',()=>{
 it('requires authentication and never accepts client userId as identity',async()=>{mock.auth.mockResolvedValue(null);expect((await POST(request({userId:'forged'}))).status).toBe(401);expect(mock.submit).not.toHaveBeenCalled();});
 it('passes the original upload payload to the single service using session ownership',async()=>{const body={assetId:'asset',fileUrl:'https://media.test/owned',width:800,height:600,mimeType:'image/png',directionId:'direction',requestKey:'stable'};mock.submit.mockResolvedValue({id:'task',directionId:'direction',status:'processing',reused:false});const result=await POST(request(body));expect(result.status).toBe(201);expect(mock.submit).toHaveBeenCalledWith('authenticated-user',body);expect(await result.json()).toMatchObject({id:'task',directionId:'direction',status:'processing'});});
 it('returns the original task receipt for a repeated key',async()=>{mock.submit.mockResolvedValue({id:'task',status:'completed',rawResponse:'raw retained',reused:true});const result=await POST(request({sourceAssetId:'owned',requestKey:'same'}));expect(result.status).toBe(200);expect(await result.json()).toMatchObject({rawResponse:'raw retained'});});
 it.each([[new WorkspaceServiceError('INVALID_INPUT'),400],[new WorkspaceNotFound(),404],[new WorkspaceConflict('request_key_conflict'),409],[new WorkspaceServiceError('RATE_LIMITED',429),429],[new WorkspaceServiceError('BUDGET_BLOCKED',429),429],[new WorkspaceServiceError('MODEL_UNAVAILABLE',503),503]])('preserves context for typed service failure %s',async(error,status)=>{mock.submit.mockRejectedValue(error);const response=await POST(request({sourceAssetId:'asset'}));expect(response.status).toBe(status);expect(await response.json()).toMatchObject({preservedContext:true});});
 it('hides raw infrastructure errors while preserving editable context',async()=>{mock.submit.mockRejectedValue(new Error('private connection detail'));const response=await POST(request({}));expect(response.status).toBe(503);expect(await response.json()).toEqual({code:'SERVICE_UNAVAILABLE',retryable:true,preservedContext:true});});
 it('malformed JSON never invokes the paid service',async()=>{expect((await POST(new Request('http://localhost/api/analysis',{method:'POST',body:'{'}))).status).toBe(400);expect(mock.submit).not.toHaveBeenCalled();});
});
