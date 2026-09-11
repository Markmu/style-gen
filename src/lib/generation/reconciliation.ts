import { upsertReservedGenerationAsset } from '@/lib/repositories/asset-repository';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { generationTasks } from '@/lib/db/schema';
import { appendEvent, findDirection, findEventByRequestKey, hashWorkspaceRequest, withWorkspaceTransaction, WorkspaceConflict, WorkspaceNotFound } from '@/lib/repositories/workspace-repository';
import { getPublicUrl, headObject, uploadBuffer } from '@/lib/r2';
import { identifier, record, requestKey, WorkspaceServiceError } from '@/lib/workspace/validation';
import { validateImageBytes, readOutput, validateOutputUrl } from './output';

type Task=typeof generationTasks.$inferSelect;
export interface PredictionEvidence {id:string;model:string;status:string;webhook?:string;output?:unknown;error?:unknown}
export interface RecoveryTransport {query:(task:Task)=>Promise<PredictionEvidence|null>;head:typeof headObject;put:typeof uploadBuffer;read:typeof readOutput;publicUrl:typeof getPublicUrl}
const transport:RecoveryTransport={head:headObject,put:uploadBuffer,read:readOutput,publicUrl:getPublicUrl,query:async task=>{
 if(task.provider!=='replicate'||!task.externalId||!process.env.REPLICATE_API_TOKEN)return null;
 const response=await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(task.externalId)}`,{headers:{Authorization:`Bearer ${process.env.REPLICATE_API_TOKEN}`},signal:AbortSignal.timeout(15_000),redirect:'error'});
 if(!response.ok)throw new Error('Provider query unavailable');const result=await response.json();
 return {id:result.id,model:result.model,status:result.status,output:result.output,error:result.error};
}};
async function readTask(userId:string,id:string) {const [task]=await db.select().from(generationTasks).where(and(eq(generationTasks.id,id),eq(generationTasks.userId,userId)));if(!task)throw new WorkspaceNotFound();return task;}
function outputUrl(output:unknown):string|null {if(typeof output==='string')return output;if(Array.isArray(output))return typeof output[0]==='string'?output[0]:null;if(output&&typeof output==='object'){const data=output as Record<string,unknown>;return typeof data.url==='string'?data.url:null;}return null;}
/** Freeze provider identity before either failure or output can affect the task. A signed early callback may bind a still-empty ID. */
export async function acceptPrediction(userId:string,id:string,evidence:PredictionEvidence,deps:RecoveryTransport=transport) {
 let task=await readTask(userId,id);
 if(!['starting','processing','succeeded','failed','canceled'].includes(evidence.status))throw new WorkspaceServiceError('PROVIDER_EVIDENCE_INVALID',409);
 if(task.provider!=='replicate'||evidence.model!==task.modelName||typeof evidence.id!=='string'||!evidence.id||evidence.id.length>200)throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);
 if(task.externalId&&task.externalId!==evidence.id)throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);
 if(!task.externalId){let callback:URL;try{callback=new URL(evidence.webhook??'');}catch{throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);}
  if(callback.pathname!=='/api/webhooks/replicate'||callback.searchParams.getAll('taskId').length!==1||callback.searchParams.get('taskId')!==id||callback.searchParams.getAll('taskType').length!==1||callback.searchParams.get('taskType')!=='generation')throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);
 }
 if(task.dispatchState==='prepared'||!task.dispatchState)throw new WorkspaceServiceError('SUBMISSION_NOT_ATTEMPTED',409);
 if(task.dispatchState==='terminal')return task;
 const [bound]=await db.update(generationTasks).set({externalId:evidence.id,updatedAt:new Date()}).where(and(eq(generationTasks.id,id),inArray(generationTasks.dispatchState,['submitting','submitted','unknown','outputStored']),or(isNull(generationTasks.externalId),eq(generationTasks.externalId,evidence.id)))).returning();
 if(!bound){task=await readTask(userId,id);if(task.externalId!==evidence.id)throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);return task;}task=bound;
 if(evidence.status==='succeeded'){
  const url=outputUrl(evidence.output);if(!url)throw new WorkspaceServiceError('OUTPUT_UNAVAILABLE',503);validateOutputUrl(url);
  await db.update(generationTasks).set({outputUrl:url,dispatchState:'submitted',updatedAt:new Date()}).where(and(eq(generationTasks.id,id),inArray(generationTasks.dispatchState,['submitting','submitted','unknown']),isNull(generationTasks.outputUrl)));
  await recoverOutput(userId,id,deps);
 }else if(evidence.status==='failed'||evidence.status==='canceled'){
  // A durable success descriptor dominates a later failure callback, even before storage commits.
  await db.update(generationTasks).set({status:'failed',dispatchState:'terminal',errorMessage:'Provider confirmed generation failure',updatedAt:new Date()}).where(and(eq(generationTasks.id,id),inArray(generationTasks.dispatchState,['submitting','submitted','unknown']),isNull(generationTasks.outputUrl),isNull(generationTasks.outputObjectKey)));
 }else{
  await db.update(generationTasks).set({dispatchState:'submitted',updatedAt:new Date()}).where(and(eq(generationTasks.id,id),inArray(generationTasks.dispatchState,['submitting','unknown'])));
 }
 return readTask(userId,id);
}
async function commitOutput(task:Task,deps:RecoveryTransport) {
 let recovered=false;
 const result=await withWorkspaceTransaction(task.userId!,task.directionId,async tx=>{
  const [current]=await tx.select().from(generationTasks).where(eq(generationTasks.id,task.id)).for('update');
  if(current.dispatchState==='terminal')return current;
  if(current.dispatchState!=='outputStored'||!current.reservedResultAssetId||!current.outputObjectKey||!current.outputMimeType||!current.outputWidth||!current.outputHeight)throw new Error('Incomplete stored output');
  const asset=await upsertReservedGenerationAsset(tx,{id:current.reservedResultAssetId,sourceGenerationTaskId:current.id,userId:current.userId!,fileUrl:deps.publicUrl(current.outputObjectKey),mimeType:current.outputMimeType,width:current.outputWidth,height:current.outputHeight});
  const [completed]=await tx.update(generationTasks).set({status:'completed',dispatchState:'terminal',resultAssetId:asset.id,errorMessage:null,updatedAt:new Date()}).where(eq(generationTasks.id,current.id)).returning();
  if(current.directionId)await appendEvent(tx,current.userId!,current.directionId,{requestKey:`result:${current.id}`,requestHash:hashWorkspaceRequest({taskId:current.id},['taskId']),kind:'generation',state:'completed',generationTaskId:current.id});
  recovered=true;
  return completed;
 });
 if(recovered)console.info(JSON.stringify({event:'output_recovered',taskId:task.id,directionId:task.directionId,phase:'terminal'}));
 return result;
}
/** Only storage work. Persist descriptor before entering; the reserved object identity survives any partial failure. */
export async function recoverOutput(userId:string,id:string,deps:RecoveryTransport=transport) {
 let task=await readTask(userId,id);if(task.dispatchState==='terminal')return task;
 if(task.dispatchState==='outputStored')return commitOutput(task,deps);
 if(!task.outputUrl||!task.reservedResultAssetId)return task;
 const signal=AbortSignal.timeout(30_000),key=task.outputObjectKey??`generated/${id}/${task.reservedResultAssetId}`;
 await db.update(generationTasks).set({outputObjectKey:key,updatedAt:new Date()}).where(and(eq(generationTasks.id,id),inArray(generationTasks.dispatchState,['submitting','submitted','unknown'])));
 const head=await deps.head(key,signal);let metadata:{width:number;height:number;mimeType:string};
 if(head){
  const m=head.metadata;metadata={width:Number(m.width),height:Number(m.height),mimeType:m.mime};
  if(m.taskid!==id||m.assetid!==task.reservedResultAssetId||!Number.isSafeInteger(metadata.width)||!Number.isSafeInteger(metadata.height)||metadata.width<1||metadata.height<1||!['image/png','image/jpeg','image/webp'].includes(metadata.mimeType)||head.contentType!==metadata.mimeType||!head.size||head.size>20*1024*1024)throw new Error('Stored output identity mismatch');
 }else{
  const bytes=await deps.read(task.outputUrl,signal);metadata=await validateImageBytes(bytes);signal.throwIfAborted();
  await deps.put(key,bytes,metadata.mimeType,{signal,metadata:{taskid:id,assetid:task.reservedResultAssetId,width:String(metadata.width),height:String(metadata.height),mime:metadata.mimeType}});
 }
 signal.throwIfAborted();
 const [stored]=await db.update(generationTasks).set({dispatchState:'outputStored',outputObjectKey:key,outputWidth:metadata.width,outputHeight:metadata.height,outputMimeType:metadata.mimeType,updatedAt:new Date()}).where(and(eq(generationTasks.id,id),inArray(generationTasks.dispatchState,['submitting','submitted','unknown']))).returning();
 task=stored??await readTask(userId,id);return task.dispatchState==='outputStored'?commitOutput(task,deps):task;
}
export async function reconcileGeneration(userId:string,id:string,options:{explicit?:boolean;now?:Date;submission?:import('./submission').SubmissionDependencies}={},deps:RecoveryTransport=transport):Promise<Task> {
 let task=await readTask(userId,id);if(!task.dispatchState||task.dispatchState==='terminal')return task;
 if(task.dispatchState==='prepared')return options.explicit?(await import('./submission')).dispatchGeneration(task,options.submission):task;
 if(task.dispatchState==='outputStored'){try{return await recoverOutput(userId,id,deps);}catch{return readTask(userId,id);}}
 const now=options.now??new Date();
 if(task.dispatchState==='submitting'&&!task.externalId&&task.deadlineAt&&task.deadlineAt<=now){await db.update(generationTasks).set({dispatchState:'unknown',errorMessage:'Submission requires reconciliation',updatedAt:now}).where(and(eq(generationTasks.id,id),eq(generationTasks.dispatchState,'submitting'),isNull(generationTasks.externalId)));}
 const [claim]=await db.update(generationTasks).set({lastReconciledAt:now}).where(and(eq(generationTasks.id,id),or(isNull(generationTasks.lastReconciledAt),lt(generationTasks.lastReconciledAt,new Date(now.getTime()-4999))))).returning();
 if(!claim)return readTask(userId,id);task=claim;
 try {
  if(task.outputUrl)return await recoverOutput(userId,id,deps);
  if(task.externalId){const result=await deps.query(task);if(result)return await acceptPrediction(userId,id,result,deps);}
 }catch { /* Query/storage availability never creates an inference or changes uncertainty into failure. */ }
 return readTask(userId,id);
}
export async function reconcileCommand(userId:string,directionId:string,input:unknown) {
 identifier(directionId);const body=record(input,['requestKey','action','targetId','baseRevision']);if(body.action!=='reconcile')throw new WorkspaceServiceError('INVALID_ACTION');
 const key=requestKey(body.requestKey),id=identifier(body.targetId),hash=hashWorkspaceRequest(body,['requestKey','action','targetId','baseRevision']);
 const direction=await findDirection(userId,directionId),task=await readTask(userId,id);if(!direction||task.directionId!==directionId)throw new WorkspaceNotFound();
 const event=await withWorkspaceTransaction(userId,directionId,async tx=>{const old=await findEventByRequestKey(userId,key,tx);if(old){if(old.requestHash!==hash||old.directionId!==directionId)throw new WorkspaceConflict('request_key_conflict');return old;}return appendEvent(tx,userId,directionId,{requestKey:key,requestHash:hash,kind:'generation',generationTaskId:id,state:'completed'});});
 const current=await reconcileGeneration(userId,id,{explicit:true});
 return {event,task:(await import('./submission')).submissionReceipt(current),preservedContext:true};
}
