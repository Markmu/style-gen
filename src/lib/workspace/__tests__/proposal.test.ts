import {describe,it,expect} from 'vitest';
import fixture from '../../../../e2e/fixtures/api-responses/analysis-v2-completed.json';
import {emptyWorkspaceDraft} from '../service';
import {applyDraftPatches,validatePatches,constraintKey} from '../validation';
import {inverseProposal,undoSnapshot,readUndoSnapshot} from '../proposal';
import {compileWorkspacePrompt} from '@/lib/prompt-composer';
import type {DraftPatch,WorkspaceDraft} from '../contracts';
import type {VisualRecipeV2Success} from '@/types/models';
const recipe=fixture.recipe as VisualRecipeV2Success;
const base=():WorkspaceDraft=>({...emptyWorkspaceDraft(),control:{schemaVersion:1,trigger:'manual',intent:'same_style',detailLevel:'standard',editorMode:'variables',customPromptDirty:false,enabledInvariantIds:recipe.styleInvariants.map(r=>r.id),variableValues:Object.fromEntries(recipe.contentVariables.map(v=>[v.name,v.defaultValue])),enabledModifierNames:[],modifierValues:{},adjustments:[]}});
const patch=(target:DraftPatch['target'],before:string|null,after:string|null,key='',action:DraftPatch['action']='set'):DraftPatch=>({target,before,after,key,action});
describe('plan-07 deterministic proposals',()=>{
 it('rejects >32, duplicates, prototype and wrong before without mutating any part',()=>{
  const draft=base(),saved=structuredClone(draft);expect(()=>validatePatches(Array.from({length:33},(_,i)=>patch('constraint',null,'x',`new:${i}`)))).toThrow();
  expect(()=>validatePatches([patch('customPrompt',null,'x'),patch('customPrompt',null,'y')])).toThrow('DUPLICATE_PATCH');
  for(const key of ['__proto__','constructor','prototype'])expect(()=>validatePatches([patch('variable',null,'x',key)])).toThrow();
  expect(()=>applyDraftPatches(draft,[patch('customPrompt',null,'first'),patch('detail','wrong','concise')],recipe)).toThrow('PATCH_BEFORE_CONFLICT');expect(draft).toEqual(saved);
 });
 it('constraints check original before values then normalize to a complete-string Set with user provenance',()=>{
  const draft={...base(),constraints:['one','two']};
  const next=applyDraftPatches(draft,[patch('constraint','one','  two  ',constraintKey('one')),patch('constraint','two','three',constraintKey('two')),patch('constraint',null,' three ','new:added')],recipe);
  expect(next.constraints).toEqual(['two','three']);const compiled=compileWorkspacePrompt(next,recipe,[]);expect(compiled.text.endsWith('two; three')).toBe(true);expect(compiled.segments.filter(s=>s.sourceKind==='user').map(s=>s.sourceId)).toEqual(['two','three']);
  const inverse=inverseProposal(draft,next,[patch('constraint','one','two',constraintKey('one'))],recipe);expect(applyDraftPatches(next,inverse,recipe).constraints).toEqual(['two','one']);expect(readUndoSnapshot(undoSnapshot(draft,next),next)).toEqual(draft);
 });
 it('precise stored full text is compared as a whole; compilation preserves supported variable substitution',()=>{
  const draft={...base(),customPrompt:'repeat repeat {{subject}}'};const next=applyDraftPatches(draft,[patch('customPrompt',draft.customPrompt,'repeat edited {{subject}}')],recipe);expect(next.customPrompt).toBe('repeat edited {{subject}}');expect(compileWorkspacePrompt(next,recipe,[]).text).toContain(recipe.contentVariables.find(v=>v.name==='subject')!.defaultValue);expect(compileWorkspacePrompt({...next,customPrompt:'manual; keep the light',constraints:[' keep the light ','keep the light']},recipe,[]).text).toBe('manual; keep the light');expect(()=>applyDraftPatches(next,[patch('customPrompt','repeat','x')],recipe)).toThrow();
 });
 it('inverse preserves prior invariant adjustment and full snapshot preserves metadata and old quality',()=>{
  const rule=recipe.styleInvariants[0];const draft=base();draft.control!.adjustments=[{invariantId:rule.id,action:'replace',replacementValue:'prior rule'}];draft.params.quality='hd';draft.aspectRatioSource='reference';
  const changes=[patch('invariant','prior rule',null,rule.id,'disable'),patch('aspectRatio','1:1','3:4'),patch('quality','hd','standard')];const next=applyDraftPatches(draft,changes,recipe);const inverse=inverseProposal(draft,next,changes,recipe);
  expect(inverse[0]).toMatchObject({action:'replace',after:'prior rule',before:null});expect(readUndoSnapshot(undoSnapshot(draft,next),next)).toEqual(draft);
  expect(()=>readUndoSnapshot(null,next)).toThrow('UNDO_SNAPSHOT_UNAVAILABLE');expect(()=>readUndoSnapshot(undoSnapshot(draft,next),{...next,customPrompt:'changed'})).toThrow();
 });
 it('variable IDs and detail values compile the same draft; unknown IDs rejected',()=>{
  const variable=recipe.contentVariables[0],draft=base();const next=applyDraftPatches(draft,[patch('variable',variable.defaultValue,'blue cup',variable.name),patch('detail','standard','concise')],recipe);expect(next.control!.variableValues[variable.name]).toBe('blue cup');expect(compileWorkspacePrompt(next,recipe,[]).text).toContain('blue cup');expect(()=>applyDraftPatches(draft,[patch('variable',null,'x','invented')],recipe)).toThrow('UNKNOWN_VARIABLE');
 });
});
