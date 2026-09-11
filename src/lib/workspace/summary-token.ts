import { createHmac, timingSafeEqual } from 'node:crypto';
import { hashWorkspaceRequest } from '@/lib/repositories/workspace-repository';
import type { DirectionRow } from '@/lib/repositories/workspace-repository';
import type { ResolvedModelBinding } from '@/lib/ai/model-config';
import { WorkspaceServiceError } from './validation';

function secret() { const value=process.env.AUTH_SECRET; if(!value)throw new WorkspaceServiceError('SUMMARY_SERVICE_UNAVAILABLE',503);return value; }
export function summaryClaims(direction:DirectionRow,binding:ResolvedModelBinding) {
 return {directionId:direction.id,revision:direction.draftRevision,draftHash:hashWorkspaceRequest({draft:direction.draft},['draft']),modelBindingHash:hashWorkspaceRequest({...binding},['modelId','provider','providerModelId'])};
}
export function signSummaryToken(direction:DirectionRow,binding:ResolvedModelBinding,now=Date.now(),retry?:{retryOf:string;snapshotHash:string}) {
 const payload=Buffer.from(JSON.stringify({...summaryClaims(direction,binding),...retry,expiresAt:now+15*60_000})).toString('base64url');
 return `${payload}.${createHmac('sha256',secret()).update(payload).digest('base64url')}`;
}
export function verifySummaryToken(token:unknown,direction:DirectionRow,binding:ResolvedModelBinding,now=Date.now(),retry?:{retryOf:string;snapshotHash:string}) {
 if(typeof token!=='string'||token.length>2048)throw new WorkspaceServiceError('SUMMARY_REQUIRED',409);
 const [payload,signature,...extra]=token.split('.');if(!payload||!signature||extra.length)throw new WorkspaceServiceError('SUMMARY_INVALID',409);
 const expected=createHmac('sha256',secret()).update(payload).digest(),actual=Buffer.from(signature,'base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new WorkspaceServiceError('SUMMARY_INVALID',409);
 let claims:Record<string,unknown>;try{claims=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw new WorkspaceServiceError('SUMMARY_INVALID',409);}
 if(claims.retryOf!==retry?.retryOf||claims.snapshotHash!==retry?.snapshotHash)throw new WorkspaceServiceError('SUMMARY_STALE',409);
 if(typeof claims.expiresAt!=='number'||claims.expiresAt<=now||Object.entries(summaryClaims(direction,binding)).some(([k,v])=>claims[k]!==v))throw new WorkspaceServiceError('SUMMARY_STALE',409);
}
