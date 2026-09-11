import { isSupportedAspectRatio } from './aspect-ratio';
import { readQuickSource, quickSettingsHash } from '@/lib/workspace/quick-authorization';
import { explicitlyAuthorizesCurrentRender } from '@/lib/ai/agent';
import { and, eq, ne, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analysisTasks, generationTasks, templates, workspaceEvents, workspaceDirections } from '@/lib/db/schema';
import { appendEvent, findDirection, hashWorkspaceRequest, withWorkspaceTransaction, WorkspaceConflict, WorkspaceNotFound, type WorkspaceTransaction } from '@/lib/repositories/workspace-repository';
import { contextForDirection, loadWorkspaceSource } from '@/lib/workspace/service';
import { identifier, record, requestKey, revision, WorkspaceServiceError } from '@/lib/workspace/validation';
import { verifySummaryToken, signSummaryToken } from '@/lib/workspace/summary-token';
import { compileWorkspacePrompt } from '@/lib/prompt-composer';
import { workspaceGenerationReadiness } from '@/lib/render-readiness';
import { requireImageProviderConfigured } from '@/lib/ai/provider-readiness';
import { requireApprovedBinding } from '@/lib/ai/cost-policy';
import { reservePaidOperation } from '@/lib/ai/cost-guard';
import { getImageGenProvider } from '@/lib/ai/providers';
import { resolveImageGenModel, resolveStoredImageGenBinding, UnknownModelError, type ResolvedModelBinding } from '@/lib/ai/model-config';
import { inlineDescriptor } from './output';
import { completeGenerationTask } from '@/lib/ai/generation-completion';
import { buildWebhookUrl } from '@/lib/ai/webhook-utils';
import { generateId } from '@/lib/ulid';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/rate-limit';
import type { ImageGenProviderName } from '@/types/models';
import type { ImageGenProvider } from '@/lib/ai/providers/types';
import { validateBody, validatePromptControlSnapshotReferences, validatePromptControlSnapshotShape } from './legacy-request';

type Task=typeof generationTasks.$inferSelect;
type Snapshot=Pick<typeof generationTasks.$inferInsert,'analysisTaskId'|'promptSnapshot'|'negativePromptSnapshot'|'params'|'modelName'|'provider'|'recipeSnapshot'|'variablesSnapshot'|'promptControlSnapshot'|'sourceTemplateId'>;
const keys=['requestKey','directionId','baseRevision','mode','retryOf','authorizationId'] as const;
export async function findSubmissionByKey(userId:string,key:string,reader:WorkspaceTransaction|typeof db=db) {
 const [row]=await reader.select().from(generationTasks).where(and(eq(generationTasks.userId,userId),eq(generationTasks.requestKey,key)));return row??null;
}
export function submissionReceipt(task:Task) {return {id:task.id,taskId:task.id,status:task.status,directionId:task.directionId,draftRevision:task.draftRevision,submissionState:task.dispatchState,requestKey:task.requestKey,preservedContext:true};}
function matchExisting(task:Task,hash:string) {
 if(task.requestHash!==hash)throw new WorkspaceConflict('request_key_conflict');
 console.info(JSON.stringify({event:'duplicate_request_reused',taskId:task.id,directionId:task.directionId,requestKeyHash:hash.slice(0,12)}));return {task,reused:true};
}
function resolveBinding(model?:string) {try{return resolveImageGenModel(model);}catch(error){if(error instanceof UnknownModelError)throw new WorkspaceServiceError('INVALID_REQUEST');throw new WorkspaceServiceError('MODEL_UNAVAILABLE',503);}}
async function assertDirectionIdle(tx:WorkspaceTransaction,userId:string,directionId:string|null,analysisId?:string, ownTurnId?:string) {
 const scope=directionId?eq(generationTasks.directionId,directionId):and(eq(generationTasks.analysisTaskId,analysisId!),isNull(generationTasks.directionId));
 const [active]=await tx.select({id:generationTasks.id}).from(generationTasks).where(and(eq(generationTasks.userId,userId),scope,or(inArray(generationTasks.status,['pending','processing']),eq(generationTasks.dispatchState,'unknown')))).limit(1);
 if(active)throw new WorkspaceServiceError('WAIT_FOR_TASK',409);
 if(directionId){const [event]=await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.directionId,directionId),ownTurnId?ne(workspaceEvents.id,ownTurnId):undefined,or(eq(workspaceEvents.proposalState,'pending'),and(eq(workspaceEvents.kind,'turn'),eq(workspaceEvents.state,'processing'))))).limit(1);if(event)throw new WorkspaceServiceError(event.proposalState==='pending'?'RESOLVE_PROPOSAL':'WAIT_FOR_TASK',409);}
}
export async function prepareGeneration(userId:string,input:unknown, authorizedTurn?:{eventId:string;replyText:string;references?:import('@/lib/workspace/contracts').ContextReference[]}) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new WorkspaceServiceError('INVALID_REQUEST');
 const directionMode=Object.hasOwn(input,'directionId');
 const body=directionMode?record(input,[...keys,'summaryToken']):input as Record<string,unknown>;
 const key=body.requestKey===undefined&&!directionMode?generateId():requestKey(body.requestKey);
 const hash=hashWorkspaceRequest(body,directionMode?keys:['requestKey','analysisTaskId','promptText','negativePromptText','params','sourceTemplateId','promptControlSnapshot']);
 // Receipts are facts. Do not re-evaluate old token, revision, provider configuration, or budgets first.
 const old=await findSubmissionByKey(userId,key);if(old)return matchExisting(old,hash);
 const directionId=directionMode?identifier(body.directionId):null;
 return withWorkspaceTransaction(userId,directionId,async(tx,direction)=>{
  const duplicate=await findSubmissionByKey(userId,key,tx);if(duplicate)return matchExisting(duplicate,hash);
  let snapshot:Snapshot,binding:ResolvedModelBinding<ImageGenProviderName>,base:number|null=null;
  if(direction){
   base=revision(body.baseRevision);if(direction.draftRevision!==base)throw new WorkspaceConflict('revision_conflict',direction.draftRevision);
   if(authorizedTurn){
    const [turn]=await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.id,authorizedTurn.eventId),eq(workspaceEvents.userId,userId),eq(workspaceEvents.directionId,direction.id)));
    if(!turn||turn.kind!=='turn'||turn.state!=='processing'||turn.baseRevision!==base||!turn.deadlineAt||turn.deadlineAt.getTime()<=Date.now()||!explicitlyAuthorizesCurrentRender(turn.inputText??''))throw new WorkspaceServiceError('TURN_AUTHORIZATION_EXPIRED',409);
   }
   await assertDirectionIdle(tx,userId,directionId,undefined,authorizedTurn?.eventId);
   if(body.mode!=='current'&&body.mode!=='retryOriginal'&&body.mode!=='quick')throw new WorkspaceServiceError('GENERATION_MODE_UNSUPPORTED');
   if(body.mode!=='quick'&&body.authorizationId!==undefined)throw new WorkspaceServiceError('GENERATION_AUTHORIZATION_UNSUPPORTED');
   if(body.mode==='retryOriginal') {
    identifier(body.retryOf);const [original]=await tx.select().from(generationTasks).where(and(eq(generationTasks.id,body.retryOf as string),eq(generationTasks.userId,userId),eq(generationTasks.directionId,direction.id)));
    if(!original)throw new WorkspaceNotFound();if(original.params.quality!=='standard'||!isSupportedAspectRatio(original.params.aspectRatio))throw new WorkspaceServiceError('ORIGINAL_SETTINGS_UNAVAILABLE',409);if(original.status!=='failed'||original.dispatchState!=='terminal')throw new WorkspaceServiceError('RETRY_NOT_CONFIRMED',409);
    // Resolve catalog membership without allowing an environment override to silently change the frozen binding.
    const current=resolveStoredImageGenBinding(original.params.model??'',original.provider,original.modelName);if(!current)throw new WorkspaceServiceError('ORIGINAL_BINDING_UNAVAILABLE',409);
    await loadWorkspaceSource(userId,'analysis',original.analysisTaskId,tx);
    if(original.sourceTemplateId)await loadWorkspaceSource(userId,'template',original.sourceTemplateId,tx);
    binding=current;verifySummaryToken(body.summaryToken,direction,binding,Date.now(),retryClaims(original));snapshot={analysisTaskId:original.analysisTaskId,promptSnapshot:original.promptSnapshot,negativePromptSnapshot:original.negativePromptSnapshot,params:original.params,modelName:original.modelName,provider:original.provider,recipeSnapshot:original.recipeSnapshot,variablesSnapshot:original.variablesSnapshot,promptControlSnapshot:original.promptControlSnapshot,sourceTemplateId:original.sourceTemplateId};
   }else{
    const context=await contextForDirection(userId,direction,tx);if(!direction.draft.params.model?.trim())throw new WorkspaceServiceError("MODEL_UNAVAILABLE",409);binding=resolveBinding(direction.draft.params.model);
    if(body.mode==='quick'){
      identifier(body.authorizationId);const [auth]=await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.id,body.authorizationId as string),eq(workspaceEvents.directionId,direction.id),eq(workspaceEvents.userId,userId)));
      const source=readQuickSource(auth?.inputText??null);
      if(direction.quickState!=='armed'||direction.quickAuthorizationId!==body.authorizationId||source?.phase!=='bound'||source.binding?.provider!==binding.provider||source.binding?.providerModelId!==binding.providerModelId||source.binding?.modelId!==binding.modelId||source.epoch!==direction.authorizationEpoch||source.activationId!==direction.quickActivationId||source.analysisTaskId!==direction.analysisTaskId||source.analysisRequestKey!==context.analysis?.requestKey||source.sourceAssetId!==direction.sourceAssetId||direction.quickSettingsHash!==quickSettingsHash(direction)||direction.draft.control?.intent!=='reconstruction'||direction.draft.control.detailLevel!=='standard')throw new WorkspaceServiceError('QUICK_AUTHORIZATION_STALE',409);
    }else verifySummaryToken(body.summaryToken,direction,binding);
    if(body.retryOf!==undefined)throw new WorkspaceServiceError('INVALID_REQUEST');
    const compiled=compileWorkspacePrompt(direction.draft,context.recipe,context.variables);
    const ready=workspaceGenerationReadiness({analysisComplete:context.analysis?.status==='completed',prompt:compiled.text,params:direction.draft.params,busy:false,pendingProposal:false,modelAvailable:true});
    if(!ready.canGenerate)throw new WorkspaceServiceError(ready.disabledReason!,409);
    snapshot={analysisTaskId:direction.analysisTaskId!,promptSnapshot:compiled.text,negativePromptSnapshot:direction.draft.negativePromptText,params:{...direction.draft.params,model:binding.modelId},modelName:binding.providerModelId,provider:binding.provider,recipeSnapshot:context.recipe,variablesSnapshot:context.variables,promptControlSnapshot:direction.draft.control,sourceTemplateId:direction.sourceTemplateId};
   }
  }else{
   const legacy=validateBody(body);if(!legacy)throw new WorkspaceServiceError('INVALID_REQUEST');
   const control=legacy.promptControlSnapshot===undefined?null:validatePromptControlSnapshotShape(legacy.promptControlSnapshot);if(legacy.promptControlSnapshot!==undefined&&!control)throw new WorkspaceServiceError('INVALID_REQUEST');
   // This also validates analysis→asset ownership, not merely the analysis row's owner.
   await loadWorkspaceSource(userId,'analysis',legacy.analysisTaskId,tx);
   const [analysis]=await tx.select().from(analysisTasks).where(and(eq(analysisTasks.id,legacy.analysisTaskId),eq(analysisTasks.userId,userId))).for('update');
   if(analysis.status!=='completed')throw new WorkspaceServiceError('INVALID_REQUEST');
   if(control&&!validatePromptControlSnapshotReferences(control,analysis.recipe,analysis.analysisTemplateVariables))throw new WorkspaceServiceError('INVALID_REQUEST');
   if(legacy.sourceTemplateId){const [memory]=await tx.select().from(templates).where(and(eq(templates.id,legacy.sourceTemplateId),eq(templates.userId,userId)));if(!memory)throw new WorkspaceServiceError('INVALID_REQUEST');await loadWorkspaceSource(userId,'template',legacy.sourceTemplateId,tx);}
   await assertDirectionIdle(tx,userId,null,analysis.id);binding=resolveBinding(legacy.params.model);
   snapshot={analysisTaskId:analysis.id,promptSnapshot:legacy.promptText,negativePromptSnapshot:legacy.negativePromptText,params:{...legacy.params,model:binding.modelId},modelName:binding.providerModelId,provider:binding.provider,recipeSnapshot:analysis.recipe,variablesSnapshot:analysis.analysisTemplateVariables,promptControlSnapshot:control,sourceTemplateId:legacy.sourceTemplateId};
  }
  requireApprovedBinding(binding);
  requireImageProviderConfigured(binding);
  const fast=checkRateLimit(userId,'generation',RATE_LIMIT_CONFIGS.generation);if(fast&&!fast.allowed)throw new WorkspaceServiceError('RATE_LIMITED',429);
  const reservation=await reservePaidOperation(tx,userId,'generation');
  const [task]=await tx.insert(generationTasks).values({...snapshot,id:generateId(),userId,directionId,requestKey:key,requestHash:hash,draftRevision:base,dispatchState:'prepared',reservedCostUsd:reservation.reservedCostUsd,reservedResultAssetId:generateId(),retryOf:body.mode==='retryOriginal'?body.retryOf as string:null}).returning();
  if(body.mode==='quick'&&direction)await tx.update(workspaceDirections).set({quickState:'consumed',updatedAt:new Date()}).where(eq(workspaceDirections.id,direction.id));
  if(authorizedTurn)await tx.update(workspaceEvents).set({state:'completed',responseKind:'render_request',replyText:authorizedTurn.replyText,...(authorizedTurn.references?{references:authorizedTurn.references}:{}),generationTaskId:task.id,updatedAt:new Date()}).where(eq(workspaceEvents.id,authorizedTurn.eventId));
  if(directionId)await appendEvent(tx,userId,directionId,{requestKey:`generation:${key}`,requestHash:hash,kind:'generation',baseRevision:base,generationTaskId:task.id,reservedCostUsd:'0'});
  console.info(JSON.stringify({event:'generation_task_created',taskId:task.id,directionId,requestKeyHash:hash.slice(0,12),baseRevision:base,binding,phase:'prepared',reservedCost:reservation.reservedCostUsd}));
  if(reservation.warning)console.info(JSON.stringify({event:'budget_warning',taskId:task.id,phase:'generation',reservedCost:reservation.reservedCostUsd}));
  return {task,reused:false};
 });
}
export interface SubmissionDependencies { provider:(binding:ResolvedModelBinding<ImageGenProviderName>)=>ImageGenProvider; complete:typeof completeGenerationTask }
const dependencies:SubmissionDependencies={provider:getImageGenProvider,complete:completeGenerationTask};
/** CAS owns the ONLY external attempt. Never dispatch submitting/unknown on retry or elapsed time. */
export async function dispatchGeneration(task:Task,deps:SubmissionDependencies=dependencies):Promise<Task> {
 const [claimed]=await db.update(generationTasks).set({dispatchState:'submitting',status:'processing',attemptedAt:new Date(),deadlineAt:new Date(Date.now()+ (task.provider==='replicate'?300_000:120_000)),updatedAt:new Date()}).where(and(eq(generationTasks.id,task.id),eq(generationTasks.dispatchState,'prepared'))).returning();
 const started=Date.now();
 if(!claimed){const [current]=await db.select().from(generationTasks).where(eq(generationTasks.id,task.id));return current;}
 try {
  const provider=deps.provider({modelId:task.params.model!,label:task.params.model!,provider:task.provider as ImageGenProviderName,providerModelId:task.modelName});
  const result=await provider.generate({prompt:task.promptSnapshot,negativePrompt:task.negativePromptSnapshot,aspectRatio:task.params.aspectRatio,quality:task.params.quality,webhookUrl:buildWebhookUrl('generation',task.id)});
  if(result.mode==='async')await db.update(generationTasks).set({externalId:result.externalId,dispatchState:'submitted',updatedAt:new Date()}).where(and(eq(generationTasks.id,task.id),eq(generationTasks.dispatchState,'submitting'),or(isNull(generationTasks.externalId),eq(generationTasks.externalId,result.externalId))));
  else {
   await db.update(generationTasks).set({outputUrl:'imageUrl' in result?result.imageUrl:inlineDescriptor(result.imageBase64,result.mimeType),outputMimeType:'mimeType' in result?result.mimeType:'image/webp',outputWidth:result.width,outputHeight:result.height,updatedAt:new Date()}).where(eq(generationTasks.id,task.id));
   const completed=await deps.complete({taskId:task.id,userId:task.userId!,durable:true,...result});
   if(completed)await db.update(generationTasks).set({dispatchState:'terminal',updatedAt:new Date()}).where(and(eq(generationTasks.id,task.id),eq(generationTasks.status,'completed')));
   else throw new Error('Output not committed');
  }
 }catch{
  await db.update(generationTasks).set({dispatchState:'unknown',errorMessage:'Submission or output requires reconciliation',updatedAt:new Date()}).where(and(eq(generationTasks.id,task.id),eq(generationTasks.dispatchState,'submitting'),eq(generationTasks.status,'processing')));
  console.info(JSON.stringify({event:'submission_unknown',taskId:task.id,directionId:task.directionId,requestKeyHash:task.requestHash?.slice(0,12),phase:'generation'}));
 }
 const [current]=await db.select().from(generationTasks).where(eq(generationTasks.id,task.id));
 console.info(JSON.stringify({event:'generation_submission_finished',taskId:task.id,directionId:task.directionId,requestKeyHash:task.requestHash?.slice(0,12),phase:current.dispatchState,duration:Date.now()-started,provider:task.provider,model:task.modelName}));
 return current;
}
export async function submitGeneration(userId:string,input:unknown,deps:SubmissionDependencies=dependencies) {
 const prepared=await prepareGeneration(userId,input);
 const task=prepared.reused?prepared.task:await dispatchGeneration(prepared.task,deps);
 return {...submissionReceipt(task),reused:prepared.reused};
}

function retryClaims(task:Task) {
 return {retryOf:task.id,snapshotHash:hashWorkspaceRequest({...task},['promptSnapshot','negativePromptSnapshot','params','modelName','provider','recipeSnapshot','variablesSnapshot','promptControlSnapshot'])};
}
export async function getRetrySummary(userId:string,taskId:string) {
 const [task]=await db.select().from(generationTasks).where(and(eq(generationTasks.userId,userId),eq(generationTasks.id,taskId)));
 if(!task?.directionId||task.status!=='failed'||task.dispatchState!=='terminal')return null;
 const direction=await findDirection(userId,task.directionId),binding=resolveStoredImageGenBinding(task.params.model??'',task.provider,task.modelName);
 if(!direction||!binding||task.params.quality!=='standard'||!isSupportedAspectRatio(task.params.aspectRatio))return null;
 return {retryOf:task.id,baseRevision:direction.draftRevision,promptSnapshot:task.promptSnapshot,negativePromptSnapshot:task.negativePromptSnapshot,params:task.params,binding,summaryToken:signSummaryToken(direction,binding,Date.now(),retryClaims(task))};
}
