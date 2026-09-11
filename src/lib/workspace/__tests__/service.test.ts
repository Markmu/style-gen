import { describe,expect,it } from 'vitest';
import { emptyWorkspaceDraft } from '../service';
import { applyDraftPatches, constraintKey, validatePatches, requestKey } from '../validation';
import type { DraftPatch } from '../contracts';
describe('workspace validated draft edits',()=>{
  const patch=(overrides:Partial<DraftPatch>={}):DraftPatch=>({target:'customPrompt',key:'',action:'set',before:null,after:'exact new text',...overrides});
  it('AC-06 applies exact before and preserves original draft on failure',()=>{
    const draft=emptyWorkspaceDraft();expect(applyDraftPatches(draft,[patch()],null).customPrompt).toBe('exact new text');expect(draft.customPrompt).toBeNull();
    expect(()=>applyDraftPatches(draft,[patch({before:'wrong'})],null)).toThrow('PATCH_BEFORE_CONFLICT');expect(draft.customPrompt).toBeNull();
  });
  it('AC-16 rejects unknown paths, duplicate operations, unsupported quality and invalid models',()=>{
    expect(()=>validatePatches([{...patch(),path:'__proto__'}])).toThrow();expect(()=>validatePatches([patch(),patch()])).toThrow('DUPLICATE_PATCH');
    expect(()=>applyDraftPatches(emptyWorkspaceDraft(),[patch({target:'quality',before:'standard',after:'hd'})],null)).toThrow('QUALITY_NOT_SUPPORTED');
    expect(()=>applyDraftPatches(emptyWorkspaceDraft(),[patch({target:'variable',key:'missing'})],null)).toThrow('UNKNOWN_VARIABLE');
    expect(()=>applyDraftPatches(emptyWorkspaceDraft(),[patch({target:'model',before:emptyWorkspaceDraft().params.model!,after:'invalid'})],null)).toThrow('INVALID_MODEL');
    expect(()=>requestKey('x'.repeat(181))).toThrow();
  });
  it('AC-06 constraints use stable complete-string identity and preserve order',()=>{
    const draft={...emptyWorkspaceDraft(),constraints:[' first ','second']};
    const result=applyDraftPatches(draft,[patch({target:'constraint',key:constraintKey('second'),before:'second',after:'replacement'})],null);
    expect(result.constraints).toEqual(['first','replacement']);
    expect(()=>applyDraftPatches(draft,[patch({target:'constraint',key:'unknown',before:null,after:'x'})],null)).toThrow('UNKNOWN_CONSTRAINT');
  });
});
