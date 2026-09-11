import { clearedQuick, quickSettingsHash } from './quick-authorization';
import { expireAgentTurns } from './turn-lease';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { analysisTasks, assets, generationTasks, templates, workspaceDirections, workspaceEvents } from '@/lib/db/schema';
import { appendEvent, createDirection, findDirection, findEventByRequestKey, hashWorkspaceRequest, listEvents, withWorkspaceTransaction, WorkspaceConflict, WorkspaceNotFound, type DirectionRow, type WorkspaceTransaction } from '@/lib/repositories/workspace-repository';
import { resolveImageGenModel, imageGenerationCapabilities, DEFAULT_IMAGE_GEN_MODEL_ID } from '@/lib/ai/model-config';
import { resolveAspectRatio } from '@/lib/generation/aspect-ratio';
import { compileWorkspacePrompt } from '@/lib/prompt-composer';
import { signSummaryToken } from './summary-token';
import { requireImageProviderConfigured } from '@/lib/ai/provider-readiness';
import { requireApprovedBinding } from '@/lib/ai/cost-policy';
import { workspaceGenerationReadiness } from '@/lib/render-readiness';
import { isVisualRecipeV2Success } from '@/lib/visual-recipe';
import { inverseProposal, undoSnapshot, readUndoSnapshot } from './proposal';
import type { WorkspaceDraft } from './contracts';
import type { StoredVisualRecipe, TemplateVariable, PromptControlSnapshot } from '@/types/models';
import { applyDraftPatches, identifier, record, requestKey, revision, stringField, validatePatches, WorkspaceServiceError } from './validation';
export { WorkspaceServiceError } from './validation';

type Reader = typeof db | WorkspaceTransaction;
type SourceKind = 'empty'|'analysis'|'iteration'|'template';
interface Source { draft:WorkspaceDraft; analysisTaskId:string|null;sourceAssetId:string|null;sourceTemplateId:string|null;sourceIterationId:string|null;recipe:StoredVisualRecipe|null;variables:TemplateVariable[];updatedAt:string|null }
export function emptyWorkspaceDraft():WorkspaceDraft {return {control:null,params:{aspectRatio:'1:1',quality:'standard',model:DEFAULT_IMAGE_GEN_MODEL_ID},customPrompt:null,negativePromptText:'',constraints:[],aspectRatioSource:'fallback'};}
function initialDraft(recipe:StoredVisualRecipe|null,prompt:string|null,negative:string|null):WorkspaceDraft {
  const draft=emptyWorkspaceDraft();draft.customPrompt=prompt;draft.negativePromptText=negative??'';
  if(isVisualRecipeV2Success(recipe)) {
    draft.control={schemaVersion:1,trigger:'manual',intent:'same_style',detailLevel:'standard',editorMode:'variables',customPromptDirty:false,enabledInvariantIds:recipe.styleInvariants.map(r=>r.id),variableValues:Object.fromEntries(recipe.contentVariables.map(v=>[v.name,v.defaultValue])),enabledModifierNames:[],modifierValues:{},adjustments:[]};
    draft.customPrompt=null;
  }
  return draft;
}
async function ownedAsset(userId:string,id:string,reader:Reader){const [row]=await reader.select().from(assets).where(and(eq(assets.id,id),eq(assets.userId,userId)));if(!row)throw new WorkspaceNotFound();return row;}
async function ownedAnalysis(userId:string,id:string,reader:Reader) {const [row]=await reader.select().from(analysisTasks).where(and(eq(analysisTasks.id,id),eq(analysisTasks.userId,userId)));if(!row)throw new WorkspaceNotFound();await ownedAsset(userId,row.sourceAssetId,reader);return row;}
async function ownedIteration(userId:string,id:string,reader:Reader,requireCompleted=true) {
  const [row]=await reader.select().from(generationTasks).where(and(eq(generationTasks.id,id),eq(generationTasks.userId,userId)));
  if(!row||row.dispatchState==='unknown'||!(requireCompleted?row.status==='completed':['completed','failed'].includes(row.status))||!row.promptSnapshot.trim()||!row.params||typeof row.params.aspectRatio!=='string'||typeof row.params.quality!=='string'||!row.modelName.trim())throw new WorkspaceNotFound();
  if(row.status==='completed'&&!row.resultAssetId)throw new WorkspaceNotFound();
  if(row.resultAssetId){const result=await ownedAsset(userId,row.resultAssetId,reader);if(!result.fileUrl||result.type!=='generated')throw new WorkspaceNotFound();}
  await ownedAnalysis(userId,row.analysisTaskId,reader);
  if(row.sourceTemplateId){const [template]=await reader.select({id:templates.id}).from(templates).where(and(eq(templates.id,row.sourceTemplateId),eq(templates.userId,userId)));if(!template)throw new WorkspaceNotFound();}
  return row;
}
export async function loadWorkspaceSource(userId:string,kind:SourceKind,id?:string,reader:Reader=db):Promise<Source> {
  const source:Source={draft:emptyWorkspaceDraft(),analysisTaskId:null,sourceAssetId:null,sourceTemplateId:null,sourceIterationId:null,recipe:null,variables:[],updatedAt:null};
  if(kind==='empty')return source;if(!id)throw new WorkspaceServiceError('SOURCE_REQUIRED');
  if(kind==='analysis') {const row=await ownedAnalysis(userId,id,reader),asset=await ownedAsset(userId,row.sourceAssetId,reader);const draft=initialDraft(row.recipe,row.promptText,row.negativePromptText);const ratio=resolveAspectRatio({referenceWidth:asset.width,referenceHeight:asset.height});draft.params.aspectRatio=ratio.aspectRatio;draft.aspectRatioSource=ratio.source;return {...source,analysisTaskId:row.id,sourceAssetId:row.sourceAssetId,recipe:row.recipe,variables:row.analysisTemplateVariables,draft,updatedAt:row.updatedAt.toISOString()};}
  if(kind==='iteration') {
    const row=await ownedIteration(userId,id,reader,false),analysis=await ownedAnalysis(userId,row.analysisTaskId,reader);
    const recipe=row.recipeSnapshot??analysis.recipe;
    const draft=initialDraft(recipe,row.promptSnapshot,row.negativePromptSnapshot);draft.control=row.promptControlSnapshot??null;draft.params={...row.params,model:row.params.model??""};draft.customPrompt=row.promptSnapshot;draft.aspectRatioSource="restore";
    return {...source,analysisTaskId:row.analysisTaskId,sourceAssetId:analysis.sourceAssetId,sourceTemplateId:row.sourceTemplateId,sourceIterationId:row.id,recipe,variables:row.variablesSnapshot??analysis.analysisTemplateVariables,draft,updatedAt:row.updatedAt.toISOString()};
  }
  const [row]=await reader.select().from(templates).where(and(eq(templates.id,id),eq(templates.userId,userId)));if(!row)throw new WorkspaceNotFound();
  if(row.sourceAssetId)await ownedAsset(userId,row.sourceAssetId,reader);
  if(row.representativeGenerationTaskId)await ownedIteration(userId,row.representativeGenerationTaskId,reader);
  let inherited=source;
  if(row.sourceGenerationTaskId){await ownedIteration(userId,row.sourceGenerationTaskId,reader);inherited=await loadWorkspaceSource(userId,'iteration',row.sourceGenerationTaskId,reader);}
  const control:PromptControlSnapshot|null=inherited.draft.control||row.variables.length?{
    ...(inherited.draft.control??{schemaVersion:1,trigger:'manual',intent:'same_style',detailLevel:'standard',editorMode:'variables',customPromptDirty:false,enabledInvariantIds:[],variableValues:{},enabledModifierNames:[],modifierValues:{},adjustments:[]}),
    editorMode:'variables',customPromptDirty:false,customTemplate:row.content,
    variableValues:Object.fromEntries(row.variables.map(variable=>[variable.name,variable.defaultValue])),
  }:null;
  return {...inherited,sourceTemplateId:row.id,sourceAssetId:row.sourceAssetId??inherited.sourceAssetId,variables:row.variables,draft:{...inherited.draft,control,customPrompt:control?null:row.content,negativePromptText:row.negativeConstraints.join('\n'),constraints:[...row.retainedRules]},updatedAt:row.updatedAt.toISOString()};
}
function validateCreate(input:unknown) {
  const body=record(input,['requestKey','title','sourceKind','sourceId','sourceRevision']);requestKey(body.requestKey);stringField(body.title,120);
  if(!['empty','analysis','iteration','template'].includes(String(body.sourceKind)))throw new WorkspaceServiceError('INVALID_SOURCE');
  if(body.sourceKind==='empty'){if(body.sourceId!==undefined||body.sourceRevision!==undefined)throw new WorkspaceServiceError('INVALID_SOURCE');}else identifier(body.sourceId);
  if(body.sourceRevision!==undefined)stringField(body.sourceRevision,40);
  return body as {requestKey:string;title:string;sourceKind:SourceKind;sourceId?:string;sourceRevision?:string};
}
export async function createWorkspaceDirection(userId:string,input:unknown) {
  const body=validateCreate(input),hash=hashWorkspaceRequest(body,['requestKey','title','sourceKind','sourceId','sourceRevision']);
  const receipt=await findEventByRequestKey(userId,`creation:${body.requestKey}`);
  if(receipt){if(receipt.requestHash!==hash)throw new WorkspaceConflict('request_key_conflict');const direction=await findDirection(userId,receipt.directionId);if(!direction)throw new WorkspaceNotFound();return {direction,reused:true};}
  const source=await loadWorkspaceSource(userId,body.sourceKind,body.sourceId);
  if(body.sourceRevision!==undefined&&body.sourceRevision!==source.updatedAt)throw new WorkspaceServiceError('SOURCE_REVISION_CONFLICT',409);
  const direction=await createDirection(userId,{title:body.title,creationRequestKey:body.requestKey,draft:source.draft,analysisTaskId:source.analysisTaskId,sourceAssetId:source.sourceAssetId,sourceTemplateId:source.sourceTemplateId,sourceIterationId:source.sourceIterationId},hash,{memoryId:body.sourceKind==='template'?source.sourceTemplateId:null,generationTaskId:body.sourceKind==='iteration'?source.sourceIterationId:null});
  return {direction,reused:false};
}
export async function contextForDirection(userId:string,direction:DirectionRow,reader:Reader=db) {
  if(direction.sourceAssetId)await ownedAsset(userId,direction.sourceAssetId,reader);
  if(direction.sourceIterationId) {
    const source=await loadWorkspaceSource(userId,'iteration',direction.sourceIterationId,reader);
    const analysis=direction.analysisTaskId?await ownedAnalysis(userId,direction.analysisTaskId,reader):null;
    const [restoration]=await reader.select({memoryId:workspaceEvents.memoryId}).from(workspaceEvents).where(and(eq(workspaceEvents.directionId,direction.id),eq(workspaceEvents.kind,'restored'))).orderBy(desc(workspaceEvents.sequence)).limit(1);
    if(direction.sourceTemplateId && restoration?.memoryId===direction.sourceTemplateId) {
      const [memory]=await reader.select().from(templates).where(and(eq(templates.id,direction.sourceTemplateId),eq(templates.userId,userId)));
      if(!memory)throw new WorkspaceNotFound();
      return {recipe:source.recipe,variables:memory.variables,analysis};
    }
    return {recipe:source.recipe,variables:source.variables,analysis};
  }
  if(direction.analysisTaskId){const row=await ownedAnalysis(userId,direction.analysisTaskId,reader);return {recipe:row.recipe,variables:row.analysisTemplateVariables,analysis:row};}
  if(direction.sourceTemplateId){const [row]=await reader.select().from(templates).where(and(eq(templates.id,direction.sourceTemplateId),eq(templates.userId,userId)));if(!row)throw new WorkspaceNotFound();return {recipe:null,variables:row.variables,analysis:null};}
  return {recipe:null,variables:[],analysis:null};
}
export async function getWorkspaceDirection(userId:string,id:string) {
  identifier(id);const direction=await findDirection(userId,id);if(!direction)throw new WorkspaceNotFound();
  await expireAgentTurns(userId,id);
  const context=await contextForDirection(userId,direction);
  const reference=direction.sourceAssetId?await ownedAsset(userId,direction.sourceAssetId,db):null;
  const original=direction.sourceIterationId?await ownedIteration(userId,direction.sourceIterationId,db,false):null;
  const previousResult=original?.status==='completed'&&original.resultAssetId?await ownedAsset(userId,original.resultAssetId,db):null;
  const [activeTask]=await db.select({id:generationTasks.id,status:generationTasks.status,dispatchState:generationTasks.dispatchState,requestKey:generationTasks.requestKey,directionId:generationTasks.directionId,draftRevision:generationTasks.draftRevision,errorMessage:generationTasks.errorMessage,deadlineAt:generationTasks.deadlineAt}).from(generationTasks).where(and(eq(generationTasks.userId,userId),eq(generationTasks.directionId,id),or(inArray(generationTasks.status,['pending','processing']),eq(generationTasks.dispatchState,'unknown'))));
  const [pending]=await db.select().from(workspaceEvents).where(and(eq(workspaceEvents.directionId,id),or(eq(workspaceEvents.proposalState,'pending'),and(eq(workspaceEvents.kind,'turn'),eq(workspaceEvents.state,'processing'))))).limit(1);
  const prompt=compileWorkspacePrompt(direction.draft,context.recipe,context.variables);
  let summaryToken:string|null=null,modelAvailable=true,capabilities:ReturnType<typeof imageGenerationCapabilities>|null=null;
  try {if(!direction.draft.params.model?.trim())throw new Error("Historical model missing");const binding=resolveImageGenModel(direction.draft.params.model);summaryToken=signSummaryToken(direction,binding);capabilities=imageGenerationCapabilities(binding);requireApprovedBinding(binding);requireImageProviderConfigured(binding);}catch{modelAvailable=false;}
  const readiness=workspaceGenerationReadiness({analysisComplete:context.analysis?.status==='completed',prompt:prompt.text,params:direction.draft.params,busy:!!activeTask||pending?.state==='processing',pendingProposal:pending?.proposalState==='pending',modelAvailable});
  return {direction,source:{previousResult:previousResult?{id:previousResult.id,fileUrl:previousResult.fileUrl}:null,reference:reference?{id:reference.id,fileUrl:reference.fileUrl,width:reference.width,height:reference.height,mimeType:reference.mimeType}:null,recipe:context.recipe,variables:context.variables,analysisTemplateContent:context.analysis?.analysisTemplateContent??direction.draft.control?.customTemplate??null,analysisTemplateStatus:context.analysis?.analysisTemplateStatus??null,analysisTemplateReason:context.analysis?.analysisTemplateReason??null,analysisStatus:context.analysis?.status??null,analysisErrorMessage:context.analysis?.errorMessage??null,analysisErrorStage:context.analysis?.errorStage??null},readiness,summaryToken,capabilities,activeTask:activeTask?{id:activeTask.id,status:activeTask.status,dispatchState:activeTask.dispatchState,requestKey:activeTask.requestKey,directionId:activeTask.directionId,draftRevision:activeTask.draftRevision,errorMessage:activeTask.errorMessage,deadlineAt:activeTask.deadlineAt}:null};
}
export async function patchWorkspaceDirection(userId:string,id:string,input:unknown) {
  identifier(id);const body=record(input,['requestKey','baseRevision','changes','title','preferredIterationId']);const key=requestKey(body.requestKey),base=revision(body.baseRevision);
  const patches=body.changes===undefined?[]:validatePatches(body.changes);if(!patches.length&&body.title===undefined&&body.preferredIterationId===undefined)throw new WorkspaceServiceError('EMPTY_PATCH');
  if(body.title!==undefined)stringField(body.title,120);if(body.preferredIterationId!==undefined&&body.preferredIterationId!==null)identifier(body.preferredIterationId);
  const hash=hashWorkspaceRequest(body,['requestKey','baseRevision','changes','title','preferredIterationId']);
  return withWorkspaceTransaction(userId,id,async(tx,row)=>{
    const direction=row!;const existing=await findEventByRequestKey(userId,key,tx);
    if(existing){if(existing.requestHash!==hash||existing.directionId!==id)throw new WorkspaceConflict('request_key_conflict');return {direction,event:existing,reused:true};}
    if(direction.draftRevision!==base)throw new WorkspaceConflict('revision_conflict',direction.draftRevision);
    if(body.preferredIterationId){const task=await ownedIteration(userId,body.preferredIterationId as string,tx);if(task.directionId!==id)throw new WorkspaceServiceError('ITERATION_DIRECTION_MISMATCH');}
    const context=await contextForDirection(userId,direction,tx);const draft=applyDraftPatches(direction.draft,patches,context.recipe,context.variables);
    const [updated]=await tx.update(workspaceDirections).set({draft,draftRevision:base+1,updatedAt:new Date(),...(body.title!==undefined?{title:body.title as string}:{}),...(body.preferredIterationId!==undefined?{preferredIterationId:body.preferredIterationId as string|null}:{}),quickState:'none',quickAuthorizationId:null,quickSnapshot:null,quickSettingsHash:null,quickActivationId:null,authorizationEpoch:direction.authorizationEpoch+1}).where(eq(workspaceDirections.id,id)).returning();
    const stale=await tx.update(workspaceEvents).set({proposalState:'stale',updatedAt:new Date()}).where(and(eq(workspaceEvents.directionId,id),eq(workspaceEvents.proposalState,'pending'))).returning({id:workspaceEvents.id});
    for(const item of stale)console.info(JSON.stringify({event:'proposal_stale',directionId:id,eventId:item.id,baseRevision:base,currentRevision:base+1}));
    const event=await appendEvent(tx,userId,id,{requestKey:key,requestHash:hash,kind:'draft_change',baseRevision:base,resultingRevision:base+1,changes:patches});
    return {direction:updated,event,reused:false};
  });
}
export async function workspaceCommand(userId:string,id:string,input:unknown) {
  identifier(id);const envelope=record(input,['requestKey','action','baseRevision','eventId','activationId','changes','targetId']);
  const actions:Record<string,string[]>={restore:['targetId'],apply:['eventId','changes'],discard:['eventId'],undo:['eventId'],armQuick:['activationId'],clearQuick:['activationId'],reconcile:['targetId']};
  const action=stringField(envelope.action,30);if(!Object.hasOwn(actions,action))throw new WorkspaceServiceError('INVALID_ACTION');
  const body=record(envelope,['requestKey','action','baseRevision',...actions[action]]);const key=requestKey(body.requestKey),base=revision(body.baseRevision);
  if(['apply','discard','undo'].includes(action))return proposalCommand(userId,id,body,action as 'apply'|'discard'|'undo',key,base);
  if(action==='armQuick'||action==='clearQuick')return quickCommand(userId,id,body,action,key,base);
  if(action!=='restore')throw new WorkspaceServiceError('ACTION_NOT_IMPLEMENTED');identifier(body.targetId);
  const hash=hashWorkspaceRequest(body,['requestKey','action','baseRevision','targetId']);
  return withWorkspaceTransaction(userId,id,async(tx,row)=>{
    const direction=row!;const existing=await findEventByRequestKey(userId,key,tx);if(existing){if(existing.requestHash!==hash||existing.directionId!==id)throw new WorkspaceConflict('request_key_conflict');return {direction,event:existing,reused:true};}
    if(direction.draftRevision!==base)throw new WorkspaceConflict('revision_conflict',direction.draftRevision);
    const source=await loadWorkspaceSource(userId,'iteration',body.targetId as string,tx);
    const [updated]=await tx.update(workspaceDirections).set({draft:source.draft,analysisTaskId:source.analysisTaskId,sourceAssetId:source.sourceAssetId,sourceIterationId:source.sourceIterationId,sourceTemplateId:source.sourceTemplateId,preferredIterationId:null,draftRevision:base+1,quickState:'none',quickAuthorizationId:null,quickSnapshot:null,quickSettingsHash:null,quickActivationId:null,authorizationEpoch:direction.authorizationEpoch+1,updatedAt:new Date()}).where(eq(workspaceDirections.id,id)).returning();
    const stale=await tx.update(workspaceEvents).set({proposalState:'stale',updatedAt:new Date()}).where(and(eq(workspaceEvents.directionId,id),eq(workspaceEvents.proposalState,'pending'))).returning({id:workspaceEvents.id});
    for(const item of stale)console.info(JSON.stringify({event:'proposal_stale',directionId:id,eventId:item.id,baseRevision:base,currentRevision:base+1}));
    const event=await appendEvent(tx,userId,id,{requestKey:key,requestHash:hash,kind:'restored',baseRevision:base,resultingRevision:base+1,generationTaskId:source.sourceIterationId});
    return {direction:updated,event,reused:false};
  });
}
export async function getWorkspaceEvents(userId:string,id:string,url:URL) {
  identifier(id);await expireAgentTurns(userId,id);const params=url.searchParams;for(const key of params.keys())if(!['page','pageSize','throughSequence','requestKey'].includes(key)||params.getAll(key).length!==1)throw new WorkspaceServiceError('INVALID_PAGINATION');
  if(params.has('requestKey')){if(params.size!==1)throw new WorkspaceServiceError('INVALID_PAGINATION');const key=requestKey(params.get('requestKey'));if(!await findDirection(userId,id))throw new WorkspaceNotFound();const event=await findEventByRequestKey(userId,key);return {event:event?.directionId===id?event:null};}
  const options: {page?:number;pageSize?:number;throughSequence?:number}={};
  for(const key of ['page','pageSize','throughSequence'] as const)if(params.has(key)){if(!/^\d+$/.test(params.get(key)!))throw new WorkspaceServiceError('INVALID_PAGINATION');options[key]=Number(params.get(key));}
  return listEvents(userId,id,options);
}

async function proposalCommand(userId:string,id:string,body:Record<string,unknown>,action:'apply'|'discard'|'undo',key:string,base:number) {
 identifier(body.eventId);
 const changes=action==='apply'?validatePatches(body.changes):[];
 if(action==='apply'&&!changes.length)throw new WorkspaceServiceError('EMPTY_PATCH');
 const hash=hashWorkspaceRequest(body,['requestKey','action','baseRevision','eventId','changes']);
 return withWorkspaceTransaction(userId,id,async(tx,row)=>{
  const direction=row!;
  const existing=await findEventByRequestKey(userId,key,tx);
  if(existing){if(existing.directionId!==id||existing.requestHash!==hash)throw new WorkspaceConflict('request_key_conflict');return {direction,event:existing,reused:true};}
  const [proposal]=await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.id,body.eventId as string),eq(workspaceEvents.userId,userId),eq(workspaceEvents.directionId,id)));
  if(!proposal)throw new WorkspaceNotFound();
  if(action==='discard'){
   if(proposal.responseKind!=='proposal'||!['pending','stale'].includes(proposal.proposalState))throw new WorkspaceServiceError('PROPOSAL_CLOSED',409,direction.draftRevision);
   await tx.update(workspaceEvents).set({proposalState:'discarded',updatedAt:new Date()}).where(eq(workspaceEvents.id,proposal.id));
   const event=await appendEvent(tx,userId,id,{requestKey:key,requestHash:hash,kind:'draft_change',relatedEventId:proposal.id,baseRevision:direction.draftRevision,replyText:'Proposal discarded. Your draft is unchanged.'});
   return {direction,event,reused:false};
  }
  if(direction.draftRevision!==base)throw new WorkspaceConflict('revision_conflict',direction.draftRevision);
  const context=await contextForDirection(userId,direction,tx);
  let draft:WorkspaceDraft;
  if(action==='apply'){
   if(proposal.responseKind!=='proposal'||proposal.proposalState!=='pending'||proposal.state!=='completed'||proposal.baseRevision!==base)throw new WorkspaceServiceError('PROPOSAL_STALE',409,direction.draftRevision);
   // A copy may change the proposed values, never redirect the original objects or before values.
   for(const ref of proposal.references){
    if(ref.kind==='asset')await ownedAsset(userId,ref.id,tx);
    else if(ref.kind==='iteration')await ownedIteration(userId,ref.id,tx);
    else if(ref.kind==='evidence'){const source=await ownedAnalysis(userId,ref.analysisTaskId!,tx);if(!isVisualRecipeV2Success(source.recipe)||![...source.recipe.styleInvariants,...Object.values(source.recipe.styleProfile).flat()].some(r=>r.id===ref.id))throw new WorkspaceNotFound();}
    else if(ref.kind==='event'){const [event]=await tx.select({id:workspaceEvents.id}).from(workspaceEvents).where(and(eq(workspaceEvents.id,ref.id),eq(workspaceEvents.userId,userId),eq(workspaceEvents.directionId,id)));if(!event)throw new WorkspaceNotFound();}
   }
   const original=validatePatches(proposal.changes);
   if(changes.length!==original.length||changes.some(p=>!original.some(o=>o.target===p.target&&o.key===p.key&&o.before===p.before)))throw new WorkspaceServiceError('PROPOSAL_TARGET_CHANGED');
   draft=applyDraftPatches(direction.draft,changes,context.recipe,context.variables);
  }else{
   if(proposal.kind!=='draft_change'||!proposal.relatedEventId||proposal.resultingRevision!==base)throw new WorkspaceServiceError('UNDO_REVISION_CONFLICT',409,direction.draftRevision);
   draft=readUndoSnapshot(proposal.inputText,direction.draft);
   // Validate all referenced objects again; stored receipts never bypass current ownership/context.
   const inverse=validatePatches(proposal.inverseChanges);
   for(const patch of inverse){
    if(patch.target==='variable'&&!context.variables.some(v=>v.name===patch.key)&&!(isVisualRecipeV2Success(context.recipe)&&context.recipe.contentVariables.some(v=>v.name===patch.key)))throw new WorkspaceServiceError('UNKNOWN_VARIABLE');
    if(patch.target==='invariant'&&!(isVisualRecipeV2Success(context.recipe)&&context.recipe.styleInvariants.some(r=>r.id===patch.key)))throw new WorkspaceServiceError('UNKNOWN_INVARIANT');
   }
  }
  compileWorkspacePrompt(draft,context.recipe,context.variables);
  const inverse=inverseProposal(direction.draft,draft,action==='apply'?changes:proposal.inverseChanges,context.recipe);
  const [updated]=await tx.update(workspaceDirections).set({draft,draftRevision:base+1,quickState:'none',quickAuthorizationId:null,quickSnapshot:null,quickSettingsHash:null,quickActivationId:null,authorizationEpoch:direction.authorizationEpoch+1,updatedAt:new Date()}).where(eq(workspaceDirections.id,id)).returning();
  if(action==='apply')await tx.update(workspaceEvents).set({proposalState:'applied',resultingRevision:base+1,inverseChanges:inverse,updatedAt:new Date()}).where(eq(workspaceEvents.id,proposal.id));
  const stale=await tx.update(workspaceEvents).set({proposalState:'stale',updatedAt:new Date()}).where(and(eq(workspaceEvents.directionId,id),eq(workspaceEvents.proposalState,'pending'))).returning({id:workspaceEvents.id});
  for(const item of stale)console.info(JSON.stringify({event:'proposal_stale',directionId:id,eventId:item.id,baseRevision:base,currentRevision:base+1}));
  const event=await appendEvent(tx,userId,id,{requestKey:key,requestHash:hash,kind:'draft_change',relatedEventId:proposal.id,baseRevision:base,resultingRevision:base+1,changes:action==='apply'?changes:proposal.inverseChanges,inverseChanges:inverse,inputText:action==='apply'?undoSnapshot(direction.draft,draft):null,replyText:action==='apply'?`Applied at revision ${base+1}. These changes affect your next image.`:`Changes undone at revision ${base+1}. No image was generated.`});
  return {direction:updated,event,reused:false};
 });
}

async function quickCommand(userId:string,id:string,body:Record<string,unknown>,action:'armQuick'|'clearQuick',key:string,base:number){
 const activation=body.activationId===undefined?null:requestKey(body.activationId);
 if(action==='armQuick'&&!activation)throw new WorkspaceServiceError('ACTIVATION_REQUIRED');
 const hash=hashWorkspaceRequest(body,['requestKey','action','baseRevision','activationId']);
 return withWorkspaceTransaction(userId,id,async(tx,row)=>{
  const direction=row!;const old=await findEventByRequestKey(userId,key,tx);if(old){if(old.directionId!==id||old.requestHash!==hash)throw new WorkspaceConflict('request_key_conflict');return {direction,event:old,reused:true};}
  if(action==='armQuick'&&direction.draftRevision!==base)throw new WorkspaceConflict('revision_conflict',direction.draftRevision);
  if(action==='armQuick'&&(direction.analysisTaskId||direction.sourceAssetId||direction.quickState==='armed'))throw new WorkspaceServiceError('QUICK_SOURCE_NOT_EMPTY',409);
  if(action==='armQuick'&&direction.draft.params.quality!=='standard')throw new WorkspaceServiceError('QUALITY_UNSUPPORTED',409);
  if(action==='clearQuick'&&activation&&direction.quickActivationId&&activation!==direction.quickActivationId)throw new WorkspaceServiceError('QUICK_ACTIVATION_STALE',409);
  if(action==='armQuick'){const binding=resolveImageGenModel(direction.draft.params.model);requireApprovedBinding(binding);requireImageProviderConfigured(binding);}
  const nextEpoch=direction.authorizationEpoch+1;
  const event=await appendEvent(tx,userId,id,{requestKey:key,requestHash:hash,kind:'authorization',baseRevision:base,inputText:action==='armQuick'?JSON.stringify({phase:'pending-next-analysis',activationId:activation,epoch:nextEpoch,binding:resolveImageGenModel(direction.draft.params.model)}):null});
  const [updated]=await tx.update(workspaceDirections).set(action==='armQuick'?{quickState:'armed',quickAuthorizationId:event.id,quickActivationId:activation,quickSettingsHash:quickSettingsHash(direction),quickSnapshot:{schemaVersion:1,intent:'reconstruction',detailLevel:'standard',aspectRatioPolicy:'reference_or_fallback',generationSettings:{model:direction.draft.params.model,quality:direction.draft.params.quality}},authorizationEpoch:nextEpoch,updatedAt:new Date()}:{...clearedQuick(direction),updatedAt:new Date()}).where(eq(workspaceDirections.id,id)).returning();
  return {direction:updated,event,reused:false};
 });
}
