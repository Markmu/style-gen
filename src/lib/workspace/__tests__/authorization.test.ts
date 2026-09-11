import {describe,it,expect,vi} from 'vitest';
import {signSummaryToken,verifySummaryToken} from '../summary-token';
import {imageGenerationCapabilities,resolveImageGenModel} from '@/lib/ai/model-config';
import {workspaceGenerationReadiness} from '@/lib/render-readiness';
import {findClosestAspectRatio} from '@/lib/generation/aspect-ratio';
import type {DirectionRow} from '@/lib/repositories/workspace-repository';
const direction={id:'direction',draftRevision:1,draft:{params:{model:'flux-2-dev',aspectRatio:'1:1',quality:'standard'},customPrompt:'Visible draft'}} as DirectionRow;
describe('current authorization summary',()=>{
 it('expires at fifteen minutes and rejects modified draft, revision and binding',()=>{vi.stubEnv('AUTH_SECRET','test-only');const binding=resolveImageGenModel('flux-2-dev'),token=signSummaryToken(direction,binding,100);expect(()=>verifySummaryToken(token,direction,binding,899999)).not.toThrow();expect(()=>verifySummaryToken(token,direction,binding,900100)).toThrow('SUMMARY_STALE');for(const changed of [{...direction,draftRevision:2},{...direction,draft:{...direction.draft,customPrompt:'Changed'}}])expect(()=>verifySummaryToken(token,changed,binding,100)).toThrow('SUMMARY_STALE');expect(()=>verifySummaryToken(token,direction,{...binding,providerModelId:'other'},100)).toThrow('SUMMARY_STALE');vi.unstubAllEnvs();});
 it('uses actual ratios and requires explicit replacement of restored HD',()=>{expect(findClosestAspectRatio(4/5)).toBe('3:4');expect(workspaceGenerationReadiness({analysisComplete:true,prompt:'p',params:{quality:'hd',aspectRatio:'1:1'},busy:false,pendingProposal:false,modelAvailable:true}).disabledReason).toBe('QUALITY_UNSUPPORTED');expect(imageGenerationCapabilities(resolveImageGenModel()).negativePromptApplied).toBe(false);});
});
