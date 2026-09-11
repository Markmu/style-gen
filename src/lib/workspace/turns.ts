import { and,desc,eq } from 'drizzle-orm';
import { assets,analysisTasks,generationTasks,workspaceEvents } from '@/lib/db/schema';
import { appendEvent,findEventByRequestKey,hashWorkspaceRequest,withWorkspaceTransaction,WorkspaceConflict,WorkspaceNotFound,type WorkspaceTransaction,type DirectionRow } from '@/lib/repositories/workspace-repository';
import { contextForDirection,loadWorkspaceSource } from './service';
import { applyDraftPatches,identifier,record,requestKey,revision,stringField,WorkspaceServiceError } from './validation';
import type { AgentReply,ContextReference } from './contracts';
import { isVisualRecipeV2Success } from '@/lib/visual-recipe';
import { getAgentProvider,interpretAgent,explicitlyAuthorizesCurrentRender } from '@/lib/ai/agent';
import { AGENT_LEASE_MS,buildAgentInput,type AgentContext } from '@/lib/ai/agent-prompt';
import { AgentError } from '@/lib/ai/agent-schema';
import { resolveStructurerModel } from '@/lib/ai/model-config';
import { requireApprovedBinding } from '@/lib/ai/cost-policy';
import { requireImageProviderConfigured } from '@/lib/ai/provider-readiness';
import { reservePaidOperation } from '@/lib/ai/cost-guard';
import { prepareGeneration,dispatchGeneration } from '@/lib/generation/submission';
import { expireAgentTurns } from './turn-lease';
export function validateTurn(input:unknown) {
 const body=record(input,['requestKey','baseRevision','text','references','summaryToken','retryOf']);
 const key=requestKey(body.requestKey),base=revision(body.baseRevision),text=stringField(body.text,12000);
 if(!Array.isArray(body.references)||body.references.length>16)throw new WorkspaceServiceError('INVALID_REFERENCES');
 const refs=body.references.map(item=>{const ref=record(item,['kind','id','analysisTaskId']);if(!['asset','iteration','evidence','event'].includes(String(ref.kind)))throw new WorkspaceServiceError('INVALID_REFERENCES');const id=ref.kind==='evidence'?stringField(ref.id,200):identifier(ref.id);const analysisTaskId=ref.analysisTaskId===null?null:identifier(ref.analysisTaskId);if((ref.kind==='evidence')!==!!analysisTaskId)throw new WorkspaceServiceError('INVALID_REFERENCES');return {kind:ref.kind,id,analysisTaskId} as ContextReference;});
 if(body.retryOf!==undefined)identifier(body.retryOf);
 if(body.summaryToken!==null&&body.summaryToken!==undefined)stringField(body.summaryToken,4096);
 return {requestKey:key,baseRevision:base,text,references:refs,summaryToken:body.summaryToken as string|null|undefined,retryOf:body.retryOf as string|undefined};
}
async function turnContext(userId:string,direction:DirectionRow,body:ReturnType<typeof validateTurn>,tx:WorkspaceTransaction):Promise<AgentContext> {
 if(direction.sourceTemplateId)await loadWorkspaceSource(userId,'template',direction.sourceTemplateId,tx);
 const context=await contextForDirection(userId,direction,tx),references:unknown[]=[],images:AgentContext['images']=[];
 const evidenceIds=isVisualRecipeV2Success(context.recipe)?[...context.recipe.styleInvariants,...Object.values(context.recipe.styleProfile).flat()].map(r=>r.id):[];
 const addImage=async(id:string)=>{if(images.some(image=>image.id===id))return;const [asset]=await tx.select().from(assets).where(and(eq(assets.id,id),eq(assets.userId,userId)));if(!asset)throw new WorkspaceNotFound();const url=new URL(asset.fileUrl);const base=process.env.R2_PUBLIC_URL;if(!base||url.origin!==new URL(base).origin||url.protocol!=='https:')throw new WorkspaceServiceError('REFERENCE_UNAVAILABLE',409);if(images.length===2)throw new WorkspaceServiceError('TOO_MANY_VISUAL_REFERENCES');images.push({id,url:asset.fileUrl,mimeType:asset.mimeType});};
 for(const ref of new Map(body.references.map(ref=>[`${ref.kind}:${ref.analysisTaskId??''}:${ref.id}`,ref])).values()){
  if(ref.kind==='asset'){await addImage(ref.id);references.push(ref);}
  if(ref.kind==='iteration'){await loadWorkspaceSource(userId,'iteration',ref.id,tx);const [task]=await tx.select().from(generationTasks).where(and(eq(generationTasks.id,ref.id),eq(generationTasks.userId,userId)));if(task.status!=='completed'||!task.resultAssetId)throw new WorkspaceNotFound();await addImage(task.resultAssetId);references.push({...ref,prompt:task.promptSnapshot,control:task.promptControlSnapshot});}
  if(ref.kind==='event'){const [event]=await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.id,ref.id),eq(workspaceEvents.userId,userId),eq(workspaceEvents.directionId,direction.id)));if(!event||event.state!=='completed'||!(event.kind==='turn'||event.kind==='draft_change'&&(event.responseKind==='proposal'||event.relatedEventId)))throw new WorkspaceNotFound();references.push({...ref,inputText:event.kind==='turn'?event.inputText:null,replyText:event.replyText,changes:event.changes,inverseChanges:event.inverseChanges,responseKind:event.responseKind,choices:event.choices,references:event.references,proposalState:event.proposalState,baseRevision:event.baseRevision});}
  if(ref.kind==='evidence'){await loadWorkspaceSource(userId,'analysis',ref.analysisTaskId!,tx);const [analysis]=await tx.select().from(analysisTasks).where(and(eq(analysisTasks.id,ref.analysisTaskId!),eq(analysisTasks.userId,userId)));const rule=isVisualRecipeV2Success(analysis.recipe)?[...analysis.recipe.styleInvariants,...Object.values(analysis.recipe.styleProfile).flat()].find(rule=>rule.id===ref.id):null;if(!rule)throw new WorkspaceNotFound();references.push({...ref,rule});evidenceIds.push(ref.id);}
 }
 const history=await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.directionId,direction.id),eq(workspaceEvents.userId,userId),eq(workspaceEvents.kind,'turn'),eq(workspaceEvents.state,'completed'))).orderBy(desc(workspaceEvents.sequence)).limit(50);
 return {draft:direction.draft,recipe:context.recipe,variables:context.variables,references,images,evidenceIds:Array.from(new Set(evidenceIds)),text:body.text,history:history.reverse().map(event=>({id:event.id,inputText:event.inputText,replyText:event.replyText,responseKind:event.responseKind,changes:event.changes,choices:event.choices,references:event.references,proposalState:event.proposalState,baseRevision:event.baseRevision}))};
}
const clarify=(text:string):AgentReply=>({kind:'clarify',text,changes:[],choices:[],evidenceIds:[]});
export interface TurnDependencies {dispatch?:typeof dispatchGeneration;interpret:typeof interpretAgent;configured:(binding:ReturnType<typeof resolveStructurerModel>)=>void}
const defaults:TurnDependencies={interpret:interpretAgent,configured:binding=>{requireApprovedBinding(binding);requireImageProviderConfigured(binding);}};
export async function submitWorkspaceTurn(userId:string,id:string,input:unknown,deps:TurnDependencies=defaults) {
 identifier(id);const body=validateTurn(input),hash=hashWorkspaceRequest(body,['requestKey','baseRevision','text','references','retryOf']);
 const start=Date.now();
 const prepared=await withWorkspaceTransaction(userId,id,async(tx,direction)=>{
  await expireAgentTurns(userId,id,tx);
  const old=await findEventByRequestKey(userId,body.requestKey,tx);
  if(old){if(old.directionId!==id||old.requestHash!==hash)throw new WorkspaceConflict('request_key_conflict');console.info(JSON.stringify({event:'duplicate_request_reused',eventId:old.id,directionId:id,requestKeyHash:hash.slice(0,12)}));return {event:old,context:null,binding:null};}
  if(direction!.draftRevision!==body.baseRevision)throw new WorkspaceConflict('revision_conflict',direction!.draftRevision);
  const [busy]=await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.directionId,id),eq(workspaceEvents.kind,'turn'),eq(workspaceEvents.state,'processing'))).limit(1);if(busy)throw new WorkspaceServiceError('WAIT_FOR_TURN',409);
  if(body.retryOf){const [failed]=await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.id,body.retryOf),eq(workspaceEvents.userId,userId),eq(workspaceEvents.directionId,id),eq(workspaceEvents.kind,'turn'),eq(workspaceEvents.state,'failed')));if(!failed)throw new WorkspaceServiceError('RETRY_NOT_CONFIRMED',409);}
  const context=await turnContext(userId,direction!,body,tx);
  let binding:ReturnType<typeof resolveStructurerModel>|null=null,errorCode:string|null=null;
  try{buildAgentInput(context);binding=resolveStructurerModel();deps.configured(binding);}catch(error){errorCode=error instanceof AgentError||error instanceof WorkspaceServiceError?error.code:'MODEL_UNAVAILABLE';}
  const reservation=errorCode?{reservedCostUsd:'0',warning:false}:await reservePaidOperation(tx,userId,'turn');
  const event=await appendEvent(tx,userId,id,{requestKey:body.requestKey,requestHash:hash,kind:'turn',state:errorCode?'failed':'processing',baseRevision:body.baseRevision,inputText:body.text,references:body.references,relatedEventId:body.retryOf??null,deadlineAt:new Date(start+AGENT_LEASE_MS),reservedCostUsd:reservation.reservedCostUsd,errorCode});
  console.info(JSON.stringify({event:'agent_turn_prepared',directionId:id,eventId:event.id,requestKeyHash:hash.slice(0,12),baseRevision:body.baseRevision,currentRevision:direction!.draftRevision,binding,phase:event.state,reservedCost:reservation.reservedCostUsd,errorCode}));
  if(reservation.warning)console.info(JSON.stringify({event:'budget_warning',directionId:id,eventId:event.id,phase:'turn',reservedCost:reservation.reservedCostUsd}));
  return {event,context,binding,analysisTaskId:direction!.analysisTaskId};
 });
 if(!prepared.context||prepared.event.state!=='processing')return {event:prepared.event,reused:!prepared.context};
 let reply:AgentReply|null=null,errorCode:string|null=null;let responseReferences=body.references;
 try{reply=await deps.interpret(prepared.context,getAgentProvider(prepared.binding!));
  const evidence=reply.evidenceIds.map(evidenceId=>{
   const explicit=body.references.filter(ref=>ref.kind==='evidence'&&ref.id===evidenceId);
   const own=isVisualRecipeV2Success(prepared.context!.recipe)&&[...prepared.context!.recipe.styleInvariants,...Object.values(prepared.context!.recipe.styleProfile).flat()].some(rule=>rule.id===evidenceId);
   const ids=new Set([...explicit.map(ref=>ref.analysisTaskId),...(own?[prepared.analysisTaskId??null]:[])]);
   ids.delete(null);if(ids.size!==1)throw new AgentError('AGENT_OUTPUT_INVALID');return {kind:'evidence' as const,id:evidenceId,analysisTaskId:[...ids][0]!};
  });
  responseReferences=Array.from(new Map([...body.references,...evidence].map(ref=>[`${ref.kind}:${ref.analysisTaskId??''}:${ref.id}`,ref])).values());
if(reply.kind==='proposal'){const context=prepared.context;applyDraftPatches(context.draft,reply.changes,context.recipe as Parameters<typeof applyDraftPatches>[2],context.variables as Parameters<typeof applyDraftPatches>[3]);}}
 catch(error){reply=null;errorCode=error instanceof AgentError?error.code:error instanceof WorkspaceServiceError?'AGENT_OUTPUT_INVALID':'AGENT_PROVIDER_FAILED';}
 if(reply?.kind==='render_request'){
  if(!explicitlyAuthorizesCurrentRender(body.text))reply=clarify('Please confirm that you want to generate the current unchanged draft.');
  else if(!body.summaryToken)reply=clarify('Review the current generation summary before generating.');
  else try{
   const generation=await prepareGeneration(userId,{directionId:id,requestKey:`turn-render:${hash}`,baseRevision:body.baseRevision,mode:'current',summaryToken:body.summaryToken},{eventId:prepared.event.id,replyText:reply.text,references:responseReferences});
   await (deps.dispatch??dispatchGeneration)(generation.task);
   const event=await findEventByRequestKey(userId,body.requestKey);return {event,reused:false};
  }catch{reply=clarify('The current draft cannot be generated yet. Review its summary, pending changes and availability.');}
 }
 const event=await withWorkspaceTransaction(userId,id,async(tx,direction)=>{
  await expireAgentTurns(userId,id,tx);const current=await findEventByRequestKey(userId,body.requestKey,tx);
  if(!current||current.state!=='processing')return current!;
  if(reply?.kind==='proposal'&&direction!.draftRevision===body.baseRevision){
   const stale=await tx.update(workspaceEvents).set({proposalState:'stale',updatedAt:new Date()}).where(and(eq(workspaceEvents.directionId,id),eq(workspaceEvents.proposalState,'pending'))).returning();
   if(stale.length)console.info(JSON.stringify({event:'proposal_stale',directionId:id,eventId:current.id,count:stale.length}));
  }
  const [updated]=await tx.update(workspaceEvents).set({state:errorCode?'failed':'completed',errorCode,replyText:reply?.text??null,responseKind:reply?.kind??null,references:errorCode?body.references:responseReferences,changes:reply?.changes??[],choices:reply?.choices??[],proposalState:reply?.kind==='proposal'?(direction!.draftRevision===body.baseRevision?'pending':'stale'):'none',updatedAt:new Date()}).where(and(eq(workspaceEvents.id,current.id),eq(workspaceEvents.state,'processing'))).returning();return updated;
 });
 console.info(JSON.stringify({event:'agent_turn_finished',directionId:id,eventId:event?.id,requestKeyHash:hash.slice(0,12),baseRevision:body.baseRevision,phase:event?.state,duration:Date.now()-start,errorCode:event?.errorCode}));
 return {event,reused:false};
}
