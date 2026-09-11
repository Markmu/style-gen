import {afterEach,expect,it,vi} from 'vitest';
import {signSummaryToken,verifySummaryToken} from '@/lib/workspace/summary-token';
import {emptyWorkspaceDraft} from '@/lib/workspace/service';
import type {DirectionRow} from '@/lib/repositories/workspace-repository';
import {compileWorkspacePrompt} from '@/lib/prompt-composer';
import {resolveImageGenModel} from '@/lib/ai/model-config';
import {workspaceGenerationReadiness} from '@/lib/render-readiness';
afterEach(()=>vi.unstubAllEnvs());
it('summary binds draft, revision, provider mapping and fifteen minute expiry',()=>{
 vi.stubEnv('AUTH_SECRET','test-only-secret');const direction={id:'direction',draftRevision:1,draft:emptyWorkspaceDraft()} as DirectionRow,binding=resolveImageGenModel();
 const token=signSummaryToken(direction,binding,1000);expect(()=>verifySummaryToken(token,direction,binding,1001)).not.toThrow();
 for(const changed of [{...direction,draftRevision:2},{...direction,draft:{...direction.draft,customPrompt:'new'}}])expect(()=>verifySummaryToken(token,changed,binding,1001)).toThrow('SUMMARY_STALE');
 expect(()=>verifySummaryToken(token,direction,binding,901000)).toThrow('SUMMARY_STALE');expect(()=>verifySummaryToken(token,direction,{...binding,providerModelId:'changed'},1001)).toThrow('SUMMARY_STALE');expect(()=>verifySummaryToken(token+'x',direction,binding,1001)).toThrow('SUMMARY_INVALID');
});
it('full text and constraint compilation never duplicates derived text, preserves variables',()=>{
 const draft={...emptyWorkspaceDraft(),customPrompt:'a {{subject}}',constraints:[' no lettering ','no lettering']};
 const result=compileWorkspacePrompt(draft,null,[{name:'subject',label:'Subject',defaultValue:'cup',type:'text'}]);expect(result.text).toBe('a cup; no lettering');expect(result.segments[0].sourceKind).toBe('user');expect(result.text.slice(result.segments[0].startIndex,result.segments[0].endIndex)).toBe('no lettering');
});
it('server readiness rejects missing variables, unsupported quality and pending proposal',()=>{
 const base={analysisComplete:true,prompt:'cup',params:{aspectRatio:'1:1',quality:'standard'},busy:false,pendingProposal:false,modelAvailable:true};
 expect(workspaceGenerationReadiness(base).canGenerate).toBe(true);
 for(const change of [{prompt:'{{missing}}'},{pendingProposal:true},{params:{aspectRatio:'4:5',quality:'standard'}},{params:{aspectRatio:'1:1',quality:'hd'}}])expect(workspaceGenerationReadiness({...base,...change}).canGenerate).toBe(false);
});
