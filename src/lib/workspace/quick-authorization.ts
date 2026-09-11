import { eq } from 'drizzle-orm';
import { workspaceDirections, workspaceEvents } from '@/lib/db/schema';
import { hashWorkspaceRequest, type DirectionRow, type WorkspaceTransaction } from '@/lib/repositories/workspace-repository';
export interface QuickSource {phase:'pending-next-analysis'|'bound';activationId:string;epoch:number;binding?:{provider:string;providerModelId:string;modelId:string};sourceAssetId?:string;analysisTaskId?:string;analysisRequestKey?:string}
export const clearedQuick=(direction:DirectionRow)=>({quickState:'none' as const,quickAuthorizationId:null,quickSnapshot:null,quickSettingsHash:null,quickActivationId:null,authorizationEpoch:direction.authorizationEpoch+1});
export function quickSettingsHash(direction:DirectionRow){return hashWorkspaceRequest({params:direction.draft.params,intent:'reconstruction',detail:'standard'},['params','intent','detail']);}
export function readQuickSource(value:string|null):QuickSource|null{try{const data=JSON.parse(value??'null');return data&&['pending-next-analysis','bound'].includes(data.phase)&&typeof data.activationId==='string'&&Number.isSafeInteger(data.epoch)?data:null;}catch{return null;}}
export async function clearQuickInTransaction(tx:WorkspaceTransaction,direction:DirectionRow){await tx.update(workspaceDirections).set({...clearedQuick(direction),updatedAt:new Date()}).where(eq(workspaceDirections.id,direction.id));}
export async function bindQuickSource(tx:WorkspaceTransaction,direction:DirectionRow,task:{id:string;sourceAssetId:string;requestKey:string|null}){
 if(direction.quickState!=='armed'||!direction.quickAuthorizationId)return;
 const [event]=await tx.select().from(workspaceEvents).where(eq(workspaceEvents.id,direction.quickAuthorizationId));const source=readQuickSource(event?.inputText??null);
 if(!source||source.phase!=='pending-next-analysis'||source.epoch!==direction.authorizationEpoch||source.activationId!==direction.quickActivationId||direction.analysisTaskId){await clearQuickInTransaction(tx,direction);return;}
 await tx.update(workspaceEvents).set({inputText:JSON.stringify({...source,phase:'bound',sourceAssetId:task.sourceAssetId,analysisTaskId:task.id,analysisRequestKey:task.requestKey})}).where(eq(workspaceEvents.id,event.id));
}
