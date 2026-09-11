import { createHash } from 'node:crypto';
import type { DraftPatch, WorkspaceDraft } from './contracts';
import type { StoredVisualRecipe, TemplateVariable } from '@/types/models';
import { isVisualRecipeV2Success } from '@/lib/visual-recipe';
import { applyInvariantAdjustment, describeInvariantAdjustment } from '@/lib/prompt-adjustments';
import { isKnownImageGenModel } from '@/lib/ai/model-config';
import { SUPPORTED_ASPECT_RATIOS } from '@/lib/generation/aspect-ratio';

export class WorkspaceServiceError extends Error {
  constructor(public code: string, public status: number = 400, public currentRevision?: number) { super(code); }
}
export function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new WorkspaceServiceError('INVALID_INPUT');
  return value as Record<string, unknown>;
}
export function stringField(value: unknown, max = 12000, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new WorkspaceServiceError('INVALID_INPUT');
  return value;
}
export function requestKey(value: unknown) { const key=stringField(value,180); if(!/^[A-Za-z0-9:_-]+$/.test(key)) throw new WorkspaceServiceError('INVALID_REQUEST_KEY'); return key; }
export function revision(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new WorkspaceServiceError('INVALID_REVISION'); return value as number; }
export function identifier(value: unknown): string { const id=stringField(value,26); if(!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) throw new WorkspaceServiceError('INVALID_ID'); return id; }
export function constraintKey(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function validatePatches(value: unknown): DraftPatch[] {
  if (!Array.isArray(value) || value.length > 32) throw new WorkspaceServiceError('INVALID_PATCHES');
  const identities=new Set<string>();
  return value.map(item => {
    const patch=record(item,['target','key','action','before','after']);
    if (!['variable','invariant','constraint','intent','detail','customPrompt','negativePrompt','model','aspectRatio','quality'].includes(String(patch.target)) || !['set','strengthen','relax','disable','replace'].includes(String(patch.action))) throw new WorkspaceServiceError('INVALID_PATCH');
    stringField(patch.key,200,true);
    if (['__proto__','prototype','constructor'].includes(patch.key as string)) throw new WorkspaceServiceError('INVALID_PATCH_KEY');
    for (const value of [patch.before,patch.after]) if(value !== null) stringField(value,12000,true);
    if(!['variable','invariant','constraint'].includes(patch.target as string) && patch.key !== '') throw new WorkspaceServiceError('INVALID_PATCH_KEY');
    const identity=`${patch.target}:${patch.key}`;if(identities.has(identity)) throw new WorkspaceServiceError('DUPLICATE_PATCH');identities.add(identity);
    return patch as unknown as DraftPatch;
  });
}
export function applyDraftPatches(current: WorkspaceDraft, patches: DraftPatch[], recipe: StoredVisualRecipe | null, variables: TemplateVariable[] = []): WorkspaceDraft {
  patches=validatePatches(patches);
  const draft=structuredClone(current);
  const constraints=new Map<string,string|null>();
  const before=(patch:DraftPatch,value:string|null) => { if(patch.before !== value) throw new WorkspaceServiceError('PATCH_BEFORE_CONFLICT',409); };
  for(const patch of patches) {
    const { target,key,action,after }=patch;
    if(target === 'invariant') {
      if(!isVisualRecipeV2Success(recipe) || !draft.control) throw new WorkspaceServiceError('MISSING_STRUCTURED_CONTEXT');
      const rule=recipe.styleInvariants.find(item=>item.id===key); if(!rule) throw new WorkspaceServiceError('UNKNOWN_INVARIANT');
      const adjustment=draft.control.adjustments.find(item=>item.invariantId===key);
      const value=!draft.control.enabledInvariantIds.includes(key)?null:adjustment?describeInvariantAdjustment(rule.value,adjustment):rule.value;
      before(patch,value);
      if(action === 'set') {
        if(after !== rule.value) throw new WorkspaceServiceError('INVALID_INVARIANT_RESET');
        draft.control.adjustments=draft.control.adjustments.filter(item=>item.invariantId!==key);
      } else {
        if(action==='replace' && (!after?.trim() || after.trim().length>200)) throw new WorkspaceServiceError('INVALID_REPLACEMENT');
        const next={invariantId:key,action,...(action==='replace'?{replacementValue:after!}:{})};
        if(describeInvariantAdjustment(rule.value,next)!==after) throw new WorkspaceServiceError('INVALID_INVARIANT_AFTER');
        draft.control.adjustments=applyInvariantAdjustment(recipe,draft.control.adjustments,next);
      }
      draft.control.enabledInvariantIds=action==='disable'?draft.control.enabledInvariantIds.filter(id=>id!==key):Array.from(new Set([...draft.control.enabledInvariantIds,key]));
      continue;
    }
    if(target === 'constraint') {
      const index=current.constraints.findIndex(value=>constraintKey(value)===key);
      if(index < 0 && !/^new:[A-Za-z0-9_-]{1,64}$/.test(key)) throw new WorkspaceServiceError('UNKNOWN_CONSTRAINT');
      before(patch,index<0?null:current.constraints[index]);
      if(!['set','replace','disable'].includes(action) || (action==='disable' && (index<0 || after!==null)) || (action!=='disable' && !after?.trim())) throw new WorkspaceServiceError('INVALID_CONSTRAINT');
      constraints.set(key,after===null?null:after.trim());continue;
    }
    if(!['set','replace'].includes(action)) throw new WorkspaceServiceError('INVALID_PATCH_ACTION');
    if(target === 'variable') {
      if(!draft.control || !((isVisualRecipeV2Success(recipe) && recipe.contentVariables.some(v=>v.name===key)) || variables.some(v=>v.name===key))) throw new WorkspaceServiceError('UNKNOWN_VARIABLE');
      before(patch,draft.control.variableValues[key]??null); if(after===null) throw new WorkspaceServiceError('INVALID_VARIABLE');draft.control.variableValues[key]=after;continue;
    }
    if(target === 'customPrompt') { before(patch,draft.customPrompt);draft.customPrompt=after;if(draft.control){draft.control.editorMode=after===null?'structured':'text';draft.control.customPromptDirty=after!==null;}continue; }
    if(target === 'negativePrompt') { before(patch,draft.negativePromptText);if(after===null)throw new WorkspaceServiceError('INVALID_NEGATIVE_PROMPT');draft.negativePromptText=after;continue; }
    if(target === 'intent' || target === 'detail') {
      if(!draft.control)throw new WorkspaceServiceError('MISSING_STRUCTURED_CONTEXT');
      if(target==='intent'){before(patch,draft.control.intent);if(after!=='reconstruction'&&after!=='same_style')throw new WorkspaceServiceError('INVALID_INTENT');draft.control.intent=after;}
      else {before(patch,draft.control.detailLevel);if(after!=='concise'&&after!=='standard'&&after!=='professional')throw new WorkspaceServiceError('INVALID_DETAIL');draft.control.detailLevel=after;}continue;
    }
    if(target === 'model') { before(patch,draft.params.model??null);if(after===null||!isKnownImageGenModel(after))throw new WorkspaceServiceError('INVALID_MODEL');draft.params.model=after; }
    if(target === 'aspectRatio') {before(patch,draft.params.aspectRatio);if(after===null||!(SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(after))throw new WorkspaceServiceError('INVALID_ASPECT_RATIO');draft.params.aspectRatio=after;draft.aspectRatioSource='user';}
    if(target === 'quality') {before(patch,draft.params.quality);if(after!=='standard')throw new WorkspaceServiceError('QUALITY_NOT_SUPPORTED');draft.params.quality=after;}
  }
  if(constraints.size){
    const values=current.constraints.flatMap(value=>{const key=constraintKey(value);if(!constraints.has(key))return [value.trim()];const next=constraints.get(key);constraints.delete(key);return next?[next]:[];});
    draft.constraints=[...new Set([...values,...constraints.values()].filter((v):v is string=>!!v))];
  }
  return draft;
}
