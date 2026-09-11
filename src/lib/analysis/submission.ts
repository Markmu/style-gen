import { analysisReferences } from './references';
import { bindQuickSource, clearQuickInTransaction, quickSettingsHash, readQuickSource } from '@/lib/workspace/quick-authorization';
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analysisTasks, assets, workspaceDirections, workspaceEvents } from '@/lib/db/schema';
import { appendEvent, findEventByRequestKey, hashWorkspaceRequest, withWorkspaceTransaction, WorkspaceConflict, WorkspaceNotFound, type WorkspaceTransaction } from '@/lib/repositories/workspace-repository';
import { emptyWorkspaceDraft, loadWorkspaceSource } from '@/lib/workspace/service';
import { identifier, record, requestKey, stringField, WorkspaceServiceError } from '@/lib/workspace/validation';
import { reservePaidOperation } from '@/lib/ai/cost-guard';
import { requireApprovedBinding } from '@/lib/ai/cost-policy';
import { resolveVisionModel, resolveStructurerModel } from '@/lib/ai/model-config';
import { getVisionProvider } from '@/lib/ai/providers';
import { structureAnalysis, StructurerError } from '@/lib/ai/structurer';
import { toAnalysisCompletionUpdate, toAnalysisFallbackUpdate } from '@/lib/ai/analysis-completion';
import { buildWebhookUrl } from '@/lib/ai/webhook-utils';
import { generateId } from '@/lib/ulid';
import type { PredictionEvidence } from '@/lib/generation/reconciliation';

type Task=typeof analysisTasks.$inferSelect;
export interface AnalysisTransport {
  vision: (task:Task,asset:typeof assets.$inferSelect,references:(typeof assets.$inferSelect)[])=>ReturnType<ReturnType<typeof getVisionProvider>['analyze']>;
  structure: typeof structureAnalysis;
  query: (task:Task)=>Promise<PredictionEvidence|null>;
}
const transport:AnalysisTransport={
  vision:(task,asset,references)=>getVisionProvider({ ...resolveVisionModel(),provider:task.provider as 'gemini'|'replicate',providerModelId:task.modelName! }).analyze({imageUrl:asset.fileUrl,mimeType:asset.mimeType,images:references.map(image=>({imageUrl:image.fileUrl,mimeType:image.mimeType})),webhookUrl:buildWebhookUrl('analysis',task.id)}),
  structure:structureAnalysis,
  query:async task=>{
    if(task.provider!=='replicate'||!task.externalId||!process.env.REPLICATE_API_TOKEN)return null;
    const result=await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(task.externalId)}`,{headers:{Authorization:`Bearer ${process.env.REPLICATE_API_TOKEN}`},signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!result.ok)return null;return result.json();
  },
};
async function taskForUser(userId:string,id:string,reader:typeof db|WorkspaceTransaction=db){const [task]=await reader.select().from(analysisTasks).where(and(eq(analysisTasks.id,id),eq(analysisTasks.userId,userId)));if(!task)throw new WorkspaceNotFound();return task;}
function validate(input:unknown): Record<string,unknown> & {requestKey:string} {
  const body=record(input,['sourceAssetId','assetId','fileUrl','width','height','mimeType','directionId','requestKey','retryOf','referenceImages']);
  if(body.sourceAssetId!==undefined){identifier(body.sourceAssetId);if(['assetId','fileUrl','width','height','mimeType'].some(k=>body[k]!==undefined))throw new WorkspaceServiceError('INVALID_INPUT');}
  else {
    identifier(body.assetId);stringField(body.fileUrl,2048);
    if(!Number.isSafeInteger(body.width)||!Number.isSafeInteger(body.height)||Number(body.width)<=0||Number(body.height)<=0)throw new WorkspaceServiceError('INVALID_INPUT');
    if(!['image/png','image/jpeg','image/webp'].includes(String(body.mimeType)))throw new WorkspaceServiceError('INVALID_INPUT');
    try{new URL(body.fileUrl as string);}catch{throw new WorkspaceServiceError('INVALID_INPUT');}

  }
  if(body.referenceImages!==undefined){
    if(!Array.isArray(body.referenceImages)||body.referenceImages.length<1||body.referenceImages.length>3)throw new WorkspaceServiceError('INVALID_INPUT');
    body.referenceImages=body.referenceImages.map(image=>{
      const value=record(image,['assetId','fileUrl','width','height','mimeType']);
      validate(value);
      return value;
    });
    const images=body.referenceImages as Record<string,unknown>[];
    if(new Set(images.map(image=>image.assetId)).size!==images.length||images[0].assetId!==(body.sourceAssetId??body.assetId))throw new WorkspaceServiceError('INVALID_INPUT');
  }
  if(body.directionId!==undefined)identifier(body.directionId);
  if(body.retryOf!==undefined)identifier(body.retryOf);
  if(body.requestKey!==undefined)requestKey(body.requestKey);
  if(body.directionId!==undefined&&body.requestKey===undefined)throw new WorkspaceServiceError('REQUEST_KEY_REQUIRED');
  return {...body,requestKey:(body.requestKey as string|undefined)??`legacy:${generateId()}`};
}
async function resolveReference(tx:WorkspaceTransaction,userId:string,input:Record<string,unknown>) {
    const assetId=(input.sourceAssetId??input.assetId) as string;
    let [asset]=await tx.select().from(assets).where(eq(assets.id,assetId));
    if(asset&&asset.userId!==userId)throw new WorkspaceNotFound();
    if(!asset&&input.sourceAssetId)throw new WorkspaceNotFound();
    if(!asset){
      const url=new URL(input.fileUrl as string);
    // Uploaded objects must reside in the configured public bucket, never arbitrary SSRF input.
    const publicBase=process.env.R2_PUBLIC_URL;
    const ext=input.mimeType==='image/jpeg'?'jpg':input.mimeType==='image/webp'?'webp':'png';
    const expected=publicBase?`${publicBase.replace(/\/$/,'')}/references/${userId}/${input.assetId}/original.${ext}`:null;
    if(url.href!==expected||url.username||url.password||url.search||url.hash)throw new WorkspaceServiceError('INVALID_ASSET_URL');
    if(!publicBase||url.origin!==new URL(publicBase).origin||!url.pathname.startsWith(new URL(publicBase).pathname.replace(/\/$/,'')+'/')||url.protocol!=='https:')throw new WorkspaceServiceError('INVALID_ASSET_URL');
    }
    if(!asset)[asset]=await tx.insert(assets).values({id:assetId,userId,type:'reference',fileUrl:input.fileUrl as string,width:input.width as number,height:input.height as number,mimeType:input.mimeType as string}).returning();
    if(!['image/png','image/jpeg','image/webp'].includes(asset.mimeType))throw new WorkspaceServiceError('INVALID_ASSET');
    return asset;
}
/** Reservation, creation receipt, task and direction binding share the same global/user/direction transaction. */
export async function prepareAnalysis(userId:string,input:unknown) {
  const body=validate(input),hash=hashWorkspaceRequest(body,['sourceAssetId','assetId','fileUrl','width','height','mimeType','directionId','requestKey','retryOf','referenceImages']);
  return withWorkspaceTransaction(userId,body.directionId as string??null,async(tx,originalDirection)=>{
    const [existing]=await tx.select().from(analysisTasks).where(and(eq(analysisTasks.userId,userId),eq(analysisTasks.requestKey,body.requestKey)));
    if(existing){const receipt=await findEventByRequestKey(userId,`analysis:${body.requestKey}`,tx);if(!receipt||receipt.requestHash!==hash)throw new WorkspaceConflict('request_key_conflict');return {task:existing,reused:true};}
    const assetId=(body.sourceAssetId??body.assetId) as string;
    const asset=await resolveReference(tx,userId,body);
    const prior=body.retryOf?await taskForUser(userId,body.retryOf as string,tx):null;
    const priorReferences=prior?await analysisReferences(prior,tx):null;
    const references = body.referenceImages ? [] : priorReferences ?? [asset];
    if (body.referenceImages) {
      for (const image of body.referenceImages as Record<string,unknown>[]) references.push(await resolveReference(tx,userId,image));
    }
    const vision=resolveVisionModel(),structurer=resolveStructurerModel();requireApprovedBinding(vision);requireApprovedBinding(structurer);
    for(const binding of [vision,structurer])if(!(binding.provider==='replicate'?process.env.REPLICATE_API_TOKEN:process.env.GEMINI_API_KEY))throw new WorkspaceServiceError('MODEL_UNAVAILABLE',503);
    const reservation=await reservePaidOperation(tx,userId,'analysis');
    if(body.assetId && !asset){throw new WorkspaceNotFound();}
    if(prior){if(JSON.stringify(references.map(image=>image.id))!==JSON.stringify(priorReferences?.map(image=>image.id)))throw new WorkspaceServiceError('ANALYSIS_RETRY_NOT_ALLOWED',409);if(prior.sourceAssetId!==assetId||prior.directionId!==originalDirection?.id||!(prior.status==='failed'||prior.status==='completed'&&prior.errorStage==='llm'))throw new WorkspaceServiceError('ANALYSIS_RETRY_NOT_ALLOWED',409);}
    let direction=originalDirection;
    if(direction){
      const [active]=await tx.select({id:analysisTasks.id}).from(analysisTasks).where(and(eq(analysisTasks.directionId,direction.id),inArray(analysisTasks.status,['pending','processing']))).limit(1);
      if(active)throw new WorkspaceServiceError('ANALYSIS_BUSY',409);
      if(direction.analysisTaskId&&!prior)throw new WorkspaceServiceError('NEW_DIRECTION_REQUIRED',409);
    }else{
      [direction]=await tx.insert(workspaceDirections).values({id:generateId(),userId,title:'Untitled direction',creationRequestKey:`analysis:${body.requestKey}`,draft:emptyWorkspaceDraft()}).returning();
    }
    const [task]=await tx.insert(analysisTasks).values({id:generateId(),userId,sourceAssetId:assetId,directionId:direction!.id,requestKey:body.requestKey,provider:vision.provider,modelName:vision.providerModelId,reservedCostUsd:reservation.reservedCostUsd,deadlineAt:new Date(Date.now()+300000),...(prior?.rawResponse?{rawResponse:prior.rawResponse,errorStage:'llm'}:{})}).returning();
    await bindQuickSource(tx,direction!,task);
    await tx.update(workspaceDirections).set({analysisTaskId:task.id,sourceAssetId:assetId,sourceIterationId:null,updatedAt:new Date()}).where(eq(workspaceDirections.id,direction!.id));
    await appendEvent(tx,userId,direction!.id,{requestKey:`analysis:${body.requestKey}`,requestHash:hash,kind:'draft_change',baseRevision:direction!.draftRevision,inputText:JSON.stringify({taskId:task.id,referenceAssetIds:references.map(image=>image.id),structurerBinding:{provider:structurer.provider,modelId:structurer.modelId,providerModelId:structurer.providerModelId},baseDraft:direction!.draft}),state:'processing',deadlineAt:task.deadlineAt});
    return {task,reused:false};
  });
}
async function finishAnalysis(task:Task,updates:ReturnType<typeof toAnalysisCompletionUpdate>|ReturnType<typeof toAnalysisFallbackUpdate>) {
  return withWorkspaceTransaction(task.userId!,task.directionId,async(tx,direction)=>{
    const current=await taskForUser(task.userId!,task.id,tx);
    if(current.status!=='processing')return current;
    const [completed]=await tx.update(analysisTasks).set({...updates,...(!('errorStage' in updates)?{errorStage:null,errorMessage:null}:{}),updatedAt:new Date()}).where(and(eq(analysisTasks.id,task.id),eq(analysisTasks.status,'processing'))).returning();
    if(direction&&direction.analysisTaskId===task.id){
      const receipt=await findEventByRequestKey(task.userId!,`analysis:${task.requestKey}`,tx);
      const source=await loadWorkspaceSource(task.userId!,'analysis',task.id,tx);
      if(receipt&&direction.draftRevision===receipt.baseRevision){
        const initialized={...source.draft,params:{...direction.draft.params,aspectRatio:direction.draft.aspectRatioSource==='user'||direction.draft.aspectRatioSource==='restore'?direction.draft.params.aspectRatio:source.draft.params.aspectRatio},aspectRatioSource:direction.draft.aspectRatioSource==='user'||direction.draft.aspectRatioSource==='restore'?direction.draft.aspectRatioSource:source.draft.aspectRatioSource};
        let keepQuick=false;
        if(direction.quickState==='armed'&&direction.quickAuthorizationId){const [auth]=await tx.select().from(workspaceEvents).where(eq(workspaceEvents.id,direction.quickAuthorizationId));const quickSource=readQuickSource(auth?.inputText??null);if(quickSource?.phase==='bound'&&quickSource.activationId===direction.quickActivationId&&quickSource.analysisRequestKey===task.requestKey&&quickSource.analysisTaskId===task.id&&quickSource.sourceAssetId===task.sourceAssetId&&quickSource.epoch===direction.authorizationEpoch&&!('errorStage' in updates)&&initialized.control){keepQuick=true;initialized.params.aspectRatio=source.draft.params.aspectRatio;initialized.aspectRatioSource=source.draft.aspectRatioSource;initialized.control={...initialized.control,intent:'reconstruction',detailLevel:'standard',trigger:'quick_recreate'};}else await clearQuickInTransaction(tx,direction);}
        await tx.update(workspaceDirections).set({draft:initialized,quickSettingsHash:keepQuick?quickSettingsHash({...direction,draft:initialized}):null,draftRevision:direction.draftRevision+1,updatedAt:new Date()}).where(eq(workspaceDirections.id,direction.id));
        await tx.update(workspaceEvents).set({state:'completed',resultingRevision:direction.draftRevision+1,updatedAt:new Date()}).where(eq(workspaceEvents.id,receipt.id));
      }else if(receipt){
        if(direction.quickState==='armed')await clearQuickInTransaction(tx,direction);
        const stale=await tx.update(workspaceEvents).set({proposalState:'stale',updatedAt:new Date()}).where(and(eq(workspaceEvents.directionId,direction.id),eq(workspaceEvents.proposalState,'pending'))).returning({id:workspaceEvents.id});
        for(const item of stale)console.info(JSON.stringify({event:'proposal_stale',directionId:direction.id,eventId:item.id,taskId:task.id}));
        await tx.update(workspaceEvents).set({state:'completed',baseRevision:direction.draftRevision,responseKind:'proposal',proposalState:'pending',replyText:'Analysis is ready. Your edited draft was preserved; review the analysis before applying it.',changes:[{target:'customPrompt',key:'',action:'set',before:direction.draft.customPrompt,after:completed.promptText}],updatedAt:new Date()}).where(eq(workspaceEvents.id,receipt.id));
      }
    }
    return completed;
  });
}
/** Durable raw text and a unique stage receipt are a one-shot structurer lease; duplicate callbacks never run inference twice. */
export async function structureTask(task:Task,raw:string,deps:AnalysisTransport=transport) {
  if(!raw||raw.length>500000)throw new WorkspaceServiceError('ANALYSIS_OUTPUT_INVALID',502);
  const claimed=await withWorkspaceTransaction(task.userId!,task.directionId,async(tx)=>{
    const current=await taskForUser(task.userId!,task.id,tx);if(current.status!=='processing')return false;
    if(await findEventByRequestKey(task.userId!,`structure:${task.id}`,tx))return false;
    await tx.update(analysisTasks).set({rawResponse:raw,errorStage:'llm',updatedAt:new Date()}).where(eq(analysisTasks.id,task.id));
    await appendEvent(tx,task.userId!,task.directionId!,{requestKey:`structure:${task.id}`,requestHash:hashWorkspaceRequest({taskId:task.id},['taskId']),kind:'draft_change',state:'processing',deadlineAt:new Date(Date.now()+60000)});
    return true;
  });
  if(!claimed)return taskForUser(task.userId!,task.id);
  const references=await analysisReferences(task);
  const asset=references[0];
  try{
    const receipt=await findEventByRequestKey(task.userId!,`analysis:${task.requestKey}`);
    const storedBinding=JSON.parse(receipt!.inputText!).structurerBinding;
    const structured=await deps.structure(raw,{taskId:task.id,source:'analysis_route',imageUrl:asset.fileUrl,mimeType:asset.mimeType,images:references.map(image=>({imageUrl:image.fileUrl,mimeType:image.mimeType}))},storedBinding);
    const result=await finishAnalysis(task,toAnalysisCompletionUpdate(structured,raw));
    await db.update(workspaceEvents).set({state:'completed',updatedAt:new Date()}).where(eq(workspaceEvents.requestKey,`structure:${task.id}`));return result;
  }catch(error){
    await clearAnalysisQuick(task);
    if(!(error instanceof StructurerError && error.confirmedResponse)){
      await db.update(analysisTasks).set({errorMessage:'Structuring submission is unconfirmed. Original analysis is preserved; no automatic retry will run.',errorStage:'llm'}).where(and(eq(analysisTasks.id,task.id),eq(analysisTasks.status,'processing')));
      console.info(JSON.stringify({event:'submission_unknown',taskId:task.id,directionId:task.directionId,phase:'structuring'}));return taskForUser(task.userId!,task.id);
    }
    // A rejected synchronous structurer response remains a usable fallback. Its raw input is retained for explicit stage-only retry.
    const result=await finishAnalysis(task,toAnalysisFallbackUpdate(raw,'Structuring could not complete. The original analysis is preserved.'));
    await db.update(workspaceEvents).set({state:'failed',errorCode:'STRUCTURER_ERROR',updatedAt:new Date()}).where(eq(workspaceEvents.requestKey,`structure:${task.id}`));return result;
  }
}
export async function dispatchAnalysis(task:Task,deps:AnalysisTransport=transport) {
  const [claimed]=await db.update(analysisTasks).set({status:'processing',updatedAt:new Date()}).where(and(eq(analysisTasks.id,task.id),eq(analysisTasks.status,'pending'))).returning();
  if(!claimed)return taskForUser(task.userId!,task.id);
  if(claimed.rawResponse)return structureTask(claimed,claimed.rawResponse,deps);
  const references=await analysisReferences(task);
  const asset=references[0];
  try{
    const result=await deps.vision(claimed,asset,references);
    if(result.mode==='sync')return structureTask(claimed,result.result,deps);
    await db.update(analysisTasks).set({externalId:result.externalId,updatedAt:new Date()}).where(and(eq(analysisTasks.id,task.id),eq(analysisTasks.status,'processing'),or(isNull(analysisTasks.externalId),eq(analysisTasks.externalId,result.externalId))));
  }catch{
    await clearAnalysisQuick(claimed);
    // A network error cannot prove that a paid request was rejected.
    await db.update(analysisTasks).set({errorMessage:'Analysis submission is unconfirmed. The original request is being preserved for reconciliation.',errorStage:'vision',updatedAt:new Date()}).where(and(eq(analysisTasks.id,task.id),eq(analysisTasks.status,'processing'),isNull(analysisTasks.rawResponse)));
    console.info(JSON.stringify({event:'submission_unknown',taskId:task.id,directionId:task.directionId,phase:'analysis'}));
  }
  return taskForUser(task.userId!,task.id);
}
export async function submitAnalysis(userId:string,input:unknown,deps:AnalysisTransport=transport) {
  const result=await prepareAnalysis(userId,input);
  return {...(result.reused?result.task:await dispatchAnalysis(result.task,deps)),reused:result.reused};
}
export async function acceptAnalysisPrediction(userId:string,id:string,evidence:PredictionEvidence,deps:AnalysisTransport=transport) {
  let task=await taskForUser(userId,id);
  if(task.provider!=='replicate'||task.modelName!==evidence.model||!evidence.id||task.externalId&&task.externalId!==evidence.id)throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);
  if(!task.externalId){let url:URL;try{url=new URL(evidence.webhook??'');}catch{throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);}if(url.pathname!=='/api/webhooks/replicate'||url.searchParams.getAll('taskId').length!==1||url.searchParams.get('taskId')!==id||url.searchParams.getAll('taskType').length!==1||url.searchParams.get('taskType')!=='analysis')throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);}
  if(task.status!=='processing')return task;
  await db.update(analysisTasks).set({externalId:evidence.id}).where(and(eq(analysisTasks.id,id),eq(analysisTasks.status,'processing'),or(isNull(analysisTasks.externalId),eq(analysisTasks.externalId,evidence.id))));
  task=await taskForUser(userId,id);
  if(task.externalId!==evidence.id)throw new WorkspaceServiceError('PROVIDER_BINDING_MISMATCH',409);
  if(evidence.status==='succeeded'){
    const raw=typeof evidence.output==='string'?evidence.output:Array.isArray(evidence.output)&&evidence.output.every(v=>typeof v==='string')?evidence.output.join(''):'';
    return structureTask(task,raw,deps);
  }
  if(evidence.status==='failed'||evidence.status==='canceled')await clearAnalysisQuick(task);
  if(evidence.status==='failed'||evidence.status==='canceled')await db.update(analysisTasks).set({status:'failed',errorStage:'vision',errorMessage:'Provider confirmed analysis failure',updatedAt:new Date()}).where(and(eq(analysisTasks.id,id),eq(analysisTasks.status,'processing'),isNull(analysisTasks.rawResponse)));
  return taskForUser(userId,id);
}
export async function reconcileAnalysis(userId:string,id:string,deps:AnalysisTransport=transport) {
  const task=await taskForUser(userId,id);
  if(task.status!=='processing'||!task.externalId||task.provider!=='replicate')return task;
  const [claimed]=await db.update(analysisTasks).set({lastReconciledAt:new Date()}).where(and(eq(analysisTasks.id,id),or(isNull(analysisTasks.lastReconciledAt),lt(analysisTasks.lastReconciledAt,new Date(Date.now()-5000))))).returning();
  if(!claimed)return task;
  try{const evidence=await deps.query(task);if(evidence)return acceptAnalysisPrediction(userId,id,evidence,deps);}catch{}
  return task;
}

async function clearAnalysisQuick(task:Task){if(!task.directionId||!task.userId)return;await withWorkspaceTransaction(task.userId,task.directionId,async(tx,direction)=>{if(direction?.analysisTaskId===task.id&&direction.quickState==='armed')await clearQuickInTransaction(tx,direction);});}
