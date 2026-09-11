import { createHash } from 'node:crypto';
import type { DraftPatch, WorkspaceDraft } from './contracts';
import type { StoredVisualRecipe } from '@/types/models';
import { isVisualRecipeV2Success } from '@/lib/visual-recipe';
import { describeInvariantAdjustment } from '@/lib/prompt-adjustments';
import { constraintKey, record, stringField, WorkspaceServiceError } from './validation';

export function draftFingerprint(draft: WorkspaceDraft): string {
 const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,stable(x)])):v;
 return createHash('sha256').update(JSON.stringify(stable(draft))).digest('hex');
}
/** Public inverse differences describe normalized business values. The owned receipt separately
 * stores the exact pre-apply draft so Undo also preserves source and inactive adjustment metadata. */
export function inverseProposal(before:WorkspaceDraft, after:WorkspaceDraft, changes:DraftPatch[], recipe:StoredVisualRecipe|null):DraftPatch[] {
 const inverse:DraftPatch[]=[];
 for(const patch of changes) {
  if(patch.target==='constraint')continue;
  if(patch.target==='invariant'&&isVisualRecipeV2Success(recipe)&&before.control&&after.control){
   const rule=recipe.styleInvariants.find(r=>r.id===patch.key)!;
   const adjustment=before.control.adjustments.find(a=>a.invariantId===patch.key);
   const oldValue=before.control.enabledInvariantIds.includes(patch.key)?adjustment?describeInvariantAdjustment(rule.value,adjustment):rule.value:null;
   inverse.push({...patch,before:patch.after,after:oldValue,action:oldValue===null?'disable':adjustment?.action??'set'});
  }else inverse.push({...patch,action:'set',before:patch.after,after:patch.before});
 }
 const priorConstraints=[...new Set(before.constraints.map(c=>c.trim()).filter(Boolean))];
 const removed=after.constraints.filter(c=>!priorConstraints.includes(c));
 const added=priorConstraints.filter(c=>!after.constraints.includes(c));
 for(let i=0;i<Math.max(removed.length,added.length);i++)inverse.push({target:'constraint',key:removed[i]?constraintKey(removed[i]):`new:undo-${i}`,action:added[i]?'set':'disable',before:removed[i]??null,after:added[i]??null});
 return inverse;
}
export function undoSnapshot(beforeDraft:WorkspaceDraft,afterDraft:WorkspaceDraft) {
 return JSON.stringify({version:1,kind:'proposalUndo',beforeDraft,afterFingerprint:draftFingerprint(afterDraft),beforeFingerprint:draftFingerprint(beforeDraft)});
}
export function readUndoSnapshot(text:string|null,current:WorkspaceDraft):WorkspaceDraft {
 try {
  const value=JSON.parse(text??'');
  if(value.version!==1||value.kind!=='proposalUndo'||!value.beforeDraft||draftFingerprint(current)!==value.afterFingerprint||draftFingerprint(value.beforeDraft)!==value.beforeFingerprint)throw new Error();
  const draft=record(value.beforeDraft,['control','params','customPrompt','negativePromptText','constraints','aspectRatioSource']);
  const params=record(draft.params,['model','aspectRatio','quality']);
  stringField(params.aspectRatio);stringField(params.quality);if(params.model!==undefined)stringField(params.model);
  if(draft.customPrompt!==null)stringField(draft.customPrompt,12000,true);stringField(draft.negativePromptText,12000,true);
  if(!Array.isArray(draft.constraints)||draft.constraints.some(c=>typeof c!=='string')||!['reference','user','restore','fallback'].includes(String(draft.aspectRatioSource)))throw new Error();
  if(draft.control!==null){
   const c=record(draft.control,['schemaVersion','trigger','intent','detailLevel','editorMode','customPromptDirty','enabledInvariantIds','variableValues','enabledModifierNames','modifierValues','adjustments','customTemplate']);
   if(c.schemaVersion!==1||!['manual','quick_recreate'].includes(String(c.trigger))||!['variables','text','structured'].includes(String(c.editorMode))||typeof c.customPromptDirty!=='boolean'||!['concise','standard','professional'].includes(String(c.detailLevel))||!['same_style','reconstruction'].includes(String(c.intent)))throw new Error();
   for(const list of [c.enabledInvariantIds,c.enabledModifierNames])if(!Array.isArray(list)||list.some(v=>typeof v!=='string'))throw new Error();
   for(const dictionary of [c.variableValues,c.modifierValues]){if(!dictionary||typeof dictionary!=='object'||Array.isArray(dictionary)||Object.entries(dictionary).some(([k,v])=>['__proto__','constructor','prototype'].includes(k)||typeof v!=='string'))throw new Error();}
   if(c.customTemplate!==undefined)stringField(c.customTemplate,12000,true);
   if(!Array.isArray(c.adjustments))throw new Error();
   for(const item of c.adjustments){const a=record(item,['invariantId','action','replacementValue']);stringField(a.invariantId,200);if(!['strengthen','relax','disable','replace'].includes(String(a.action)))throw new Error();if(a.action==='replace')stringField(a.replacementValue,200);}
  }
  return structuredClone(value.beforeDraft);
 }catch{throw new WorkspaceServiceError('UNDO_SNAPSHOT_UNAVAILABLE',409);}
}
