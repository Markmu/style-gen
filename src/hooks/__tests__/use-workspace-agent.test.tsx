// @vitest-environment jsdom
import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {LocalWorkspaceDraft} from '@/lib/workspace/draft-store';
const state=vi.hoisted(()=>({records:new Map<string,LocalWorkspaceDraft>(),recent:new Map<string,string>(),writeGate:null as null|((value:LocalWorkspaceDraft)=>Promise<void>)}));
vi.mock('@/lib/workspace/draft-store',async original=>({...await original<object>(),createIndexedDraftStorage:()=>({read:async(user:string,id:string)=>state.records.get(user+id)??null,recent:async(user:string)=>state.recent.get(user)??null,write:async(value:LocalWorkspaceDraft)=>{await state.writeGate?.(value);state.records.set(value.userId+value.directionId,value);state.recent.set(value.userId,value.directionId);}})}));
import {useWorkspaceAgent} from '../use-workspace-agent';
beforeEach(()=>{state.records.clear();state.recent.clear();state.writeGate=null;vi.stubGlobal('fetch',vi.fn());});
describe('canonical workspace owner',()=>{
 it('unsent text and a blob survive awaited flush and remount without requests',async()=>{
  const first=renderHook(()=>useWorkspaceAgent({userId:'one'}));await waitFor(()=>expect(first.result.current.saveState).toBe('local'));
  act(()=>first.result.current.setMessage('keep this goal'));
  await act(async()=>{await first.result.current.attach([new File(['pixels'],'ref.png',{type:'image/png'})]);await first.result.current.flush();});
  first.unmount();const second=renderHook(()=>useWorkspaceAgent({userId:'one'}));await waitFor(()=>expect(second.result.current.localDraft.text).toBe('keep this goal'));expect(second.result.current.localDraft.attachmentName).toBe('ref.png');expect(fetch).not.toHaveBeenCalled();
 });
 it('changing accounts hides another account cache and never replays an action',async()=>{
  const hook=renderHook(({userId})=>useWorkspaceAgent({userId}),{initialProps:{userId:'one'}});await waitFor(()=>expect(hook.result.current.saveState).toBe('local'));act(()=>hook.result.current.setMessage('private'));await act(()=>hook.result.current.flush());hook.rerender({userId:'two'});await waitFor(()=>expect(hook.result.current.localDraft.userId).toBe('two'));expect(hook.result.current.localDraft.text).toBe('');expect(fetch).not.toHaveBeenCalled();
 });
 it('401 pauses writes but allows editing without initiating login',async()=>{
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({code:'UNAUTHORIZED'}),{status:401}));
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.writesPaused).toBe(true));act(()=>hook.result.current.setMessage('still editable'));await act(()=>hook.result.current.flush());expect(hook.result.current.localDraft.text).toBe('still editable');expect(fetch).toHaveBeenCalledTimes(1);
 });
 it('preview cancel performs no writes and preserves local input',async()=>{
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one'}));await waitFor(()=>expect(hook.result.current.saveState).toBe('local'));act(()=>hook.result.current.setMessage('keep'));await act(()=>hook.result.current.previewSource('empty'));act(()=>hook.result.current.cancelSource());expect(hook.result.current.localDraft.text).toBe('keep');expect(fetch).not.toHaveBeenCalled();
 });
});

const serverDirection=()=>({direction:{id:'direction',userId:'one',title:'Test',draftRevision:0,analysisTaskId:null,sourceAssetId:null,sourceTemplateId:null,sourceIterationId:null,preferredIterationId:null,draft:{control:null,customPrompt:null,negativePromptText:'',params:{model:'flux-2-dev',aspectRatio:'1:1',quality:'standard'},constraints:[],aspectRatioSource:'fallback'}},source:{reference:null,recipe:null,variables:[],analysisStatus:null},activeTask:null,summaryToken:'token'});
function mockDirectionApi(handler?:(body:Record<string,any>)=>Promise<Response>){ // eslint-disable-line @typescript-eslint/no-explicit-any
 const server=serverDirection();const bodies:Record<string,any>[]=[]; // eslint-disable-line @typescript-eslint/no-explicit-any
 vi.mocked(fetch).mockImplementation(async(path,init)=>{
  if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));
  if(init?.method==='PATCH'){
   const body=JSON.parse(init.body as string);bodies.push(body);if(handler)return handler(body);
   for(const patch of body.changes)if(patch.target==='customPrompt')server.direction.draft.customPrompt=patch.after;
   server.direction.draftRevision++;return new Response(JSON.stringify({direction:server.direction}));
  }
  return new Response(JSON.stringify(server));
 });return {server,bodies};
}
describe('immutable saves and source recovery',()=>{
 it('debounced expert edits restore even on an empty reference direction',async()=>{
  mockDirectionApi();const first=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(first.result.current.directionId).toBe('direction'));
  act(()=>first.result.current.setPromptText('unsaved expert edit'));await act(()=>first.result.current.flush());first.unmount();const second=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(second.result.current.promptText).toBe('unsaved expert edit'));
 });
 it('edits made while PATCH is pending are saved as another request before action flush returns',async()=>{
  let release!:()=>void;const server=serverDirection();let count=0;const api=mockDirectionApi(async body=>{if(count++===0)await new Promise<void>(r=>release=r);server.direction.draft.customPrompt=body.changes.find((patch:Record<string,unknown>)=>patch.target==='customPrompt').after;server.direction.draftRevision++;return new Response(JSON.stringify({direction:server.direction}));});
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setPromptText('first edit'));
  let saving!:Promise<void>;act(()=>{saving=hook.result.current.saveDraft();});await waitFor(()=>expect(api.bodies).toHaveLength(1));act(()=>hook.result.current.setPromptText('new edit'));await act(async()=>{release();await saving;});expect(api.bodies).toHaveLength(2);expect(api.bodies[0].requestKey).not.toBe(api.bodies[1].requestKey);expect(hook.result.current.promptText).toBe('new edit');expect(hook.result.current.localDraft.pendingSave).toBeNull();
 });
 it('a lost save response preserves its exact body when user edits before retry',async()=>{
  const server=serverDirection();let count=0;const api=mockDirectionApi(async body=>{if(count++===0){server.direction.draft.customPrompt=body.changes[0].after;server.direction.draftRevision++;throw new Error('response lost');}if(count===2)return new Response(JSON.stringify({direction:server.direction}));server.direction.draft.customPrompt=body.changes[0].after;server.direction.draftRevision++;return new Response(JSON.stringify({direction:server.direction}));});
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setPromptText('first'));await act(async()=>{await expect(hook.result.current.saveDraft()).rejects.toThrow('response lost');});act(()=>hook.result.current.setPromptText('second'));await act(()=>hook.result.current.saveDraft());expect(api.bodies[1]).toEqual(api.bodies[0]);expect(api.bodies[2].changes[0].after).toBe('second');expect(api.bodies[2].requestKey).not.toBe(api.bodies[0].requestKey);
 });
 it('an unattempted edit reverted to baseline clears pending save without a server write',async()=>{
  const api=mockDirectionApi();const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setPromptText('temporary'));act(()=>hook.result.current.setPromptText(''));await act(()=>hook.result.current.saveDraft());expect(api.bodies).toHaveLength(0);
 });
});

describe('direction and render intent identity',()=>{
 it('keeps an unconfirmed render envelope byte-for-byte and rotates only after confirmed terminal task',async()=>{
  const server=serverDirection();Object.assign(server.direction.draft,{customPrompt:'Visible draft'});let task:Record<string,string>|null=null;
  vi.mocked(fetch).mockImplementation(async path=>new Response(JSON.stringify(String(path).includes('/events')?{items:[],throughSequence:0,hasMore:false}:String(path).includes('?requestKey=')?{task}:server)));
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));
  act(()=>hook.result.current.markSummaryDisplayed(hook.result.current.generationSummary!));
  let first!:Awaited<ReturnType<typeof hook.result.current.generationRequest>>;await act(async()=>{first=await hook.result.current.generationRequest();});await act(async()=>{await expect(hook.result.current.generationRequest()).rejects.toThrow('Check the original');});expect(hook.result.current.localDraft.generationIntent).toEqual(first);
  task={id:'task',status:'processing',submissionState:'unknown'};await act(async()=>{await expect(hook.result.current.generationRequest()).rejects.toThrow('Check the original');});expect(hook.result.current.localDraft.generationIntent).toEqual(first);
  task={id:'task',status:'completed'};await act(async()=>{expect((await hook.result.current.generationRequest()).requestKey).not.toBe(first.requestKey);});
 });
 it('explicit URL direction takes precedence over the current user recent pointer',async()=>{
  state.recent.set('one','old-direction');mockDirectionApi();const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path).includes('old-direction'))).toBe(false);
 });
 it('a homepage analysis entry reuses its existing direction without upload, analysis or direction creation',async()=>{
  state.recent.set('one','old-direction');const server=serverDirection();
  vi.mocked(fetch).mockImplementation(async path=>new Response(JSON.stringify(String(path)==='/api/analysis/home-analysis'?{id:'home-analysis',directionId:'direction'}:String(path).includes('/events')?{items:[],throughSequence:0,hasMore:false}:server)));
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',source:{kind:'analysis',id:'home-analysis'}}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path).includes('old-direction'))).toBe(false);
 });
 it('failed target creation keeps the old direction and reuses the same transition key',async()=>{
  const api=mockDirectionApi();const original=vi.mocked(fetch).getMockImplementation()!;const creates:string[]=[];
  vi.mocked(fetch).mockImplementation(async(path,init)=>{if(init?.method==='POST'){creates.push(String(init.body));return new Response(JSON.stringify({code:'SERVICE_UNAVAILABLE'}),{status:503});}return original(path,init);});
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setMessage('old message'));await act(async()=>{await expect(hook.result.current.activateSource({kind:'empty'})).rejects.toThrow();});expect(hook.result.current.directionId).toBe('direction');expect(hook.result.current.localDraft.text).toBe('old message');await act(async()=>{await expect(hook.result.current.activateSource({kind:'empty'})).rejects.toThrow();});expect(creates[1]).toEqual(creates[0]);expect(api.bodies).toHaveLength(0);
 });
});

describe('structured editor persistence',()=>{
 it('saves variables structurally, restores the editor, and can edit another variable after refresh',async()=>{
  const {default:fixture}=await import('../../../e2e/fixtures/api-responses/analysis-v2-completed.json');
  const {applyDraftPatches}=await import('@/lib/workspace/validation');
  const server=serverDirection() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const recipe=fixture.recipe;server.source.recipe=recipe;server.source.analysisStatus='completed';server.direction.analysisTaskId='analysis';
  server.direction.draft.control={schemaVersion:1,trigger:'manual',intent:'same_style',detailLevel:'standard',editorMode:'variables',customPromptDirty:false,enabledInvariantIds:recipe.styleInvariants.map(rule=>rule.id),variableValues:Object.fromEntries(recipe.contentVariables.map(variable=>[variable.name,variable.defaultValue])),enabledModifierNames:[],modifierValues:{},adjustments:[]};
  const bodies:any[]=[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  vi.mocked(fetch).mockImplementation(async(path,init)=>{
   if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));
   if(init?.method==='PATCH'){const body=JSON.parse(String(init.body));bodies.push(body);server.direction.draft=applyDraftPatches(server.direction.draft,body.changes,recipe as never,[]);server.direction.draftRevision++;return new Response(JSON.stringify({direction:server.direction}));}
   return new Response(JSON.stringify(server));
  });
  const first=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(first.result.current.v2PromptState).not.toBeNull());
  const [firstVariable,secondVariable]=recipe.contentVariables;
  act(()=>first.result.current.setV2PromptState(current=>({...current,variableValues:{...current.variableValues,[firstVariable.name]:'first local value'}})));
  await act(()=>first.result.current.saveDraft());expect(bodies[0].changes).toEqual([expect.objectContaining({target:'variable',key:firstVariable.name,after:'first local value'})]);first.unmount();
  const restored=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(restored.result.current.v2PromptState?.variableValues[firstVariable.name]).toBe('first local value'));expect(restored.result.current.expert.customPromptDirty).toBe(false);expect(restored.result.current.v2PromptState?.outputMode).not.toBe('custom');
  act(()=>restored.result.current.setV2PromptState(current=>({...current,variableValues:{...current.variableValues,[secondVariable.name]:'second local value'}})));await act(()=>restored.result.current.saveDraft());expect(bodies[1].changes).toEqual([expect.objectContaining({target:'variable',key:secondVariable.name,after:'second local value'})]);
  act(()=>restored.result.current.setV2PromptState(current=>({...current,enabledModifierNames:['mood'],modifierValues:{mood:'energetic'}})));await act(()=>restored.result.current.saveDraft());expect(bodies[2].changes).toEqual([expect.objectContaining({target:'customPrompt',after:expect.stringContaining('energetic')})]);restored.unmount();
  const modifierRestored=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(modifierRestored.result.current.v2PromptState?.modifierValues.mood).toBe('energetic'));expect(modifierRestored.result.current.expert.customPromptDirty).toBe(false);
  act(()=>modifierRestored.result.current.setV2PromptState(current=>({...current,modifierValues:{mood:'quiet'}})));await act(()=>modifierRestored.result.current.saveDraft());expect(bodies[3].changes).toEqual([expect.objectContaining({target:'customPrompt',after:expect.stringContaining('quiet')})]);

 });
 it('a lost new-reference response preserves the old direction and reuses the original analysis intent',async()=>{
  mockDirectionApi();const original=vi.mocked(fetch).getMockImplementation()!;const requests:string[]=[];
  vi.mocked(fetch).mockImplementation(async(path,init)=>{if(String(path)==='/api/analysis'){requests.push(String(init?.body));throw new Error('lost response');}return original(path,init);});
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setMessage('old direction goal'));
  await act(async()=>{await expect(hook.result.current.analyzeNewReference('result-asset')).rejects.toThrow('lost response');});await act(async()=>{await expect(hook.result.current.analyzeNewReference('result-asset')).rejects.toThrow('lost response');});expect(requests[1]).toBe(requests[0]);expect(hook.result.current.directionId).toBe('direction');expect(hook.result.current.localDraft.text).toBe('old direction goal');expect(JSON.parse(requests[0])).toMatchObject({sourceAssetId:'result-asset',requestKey:expect.any(String)});
 });
});

describe('transition epoch and event isolation',()=>{
 it('successful direction switches discard old events even when both directions use the same sequence',async()=>{
  const original=serverDirection();const target=structuredClone(original);target.direction.id='next';
  vi.mocked(fetch).mockImplementation(async(path,init)=>{const next=String(path).includes('/next');if(String(path).includes('/events'))return new Response(JSON.stringify({items:[{id:next?'next-event':'old-event',sequence:1}],throughSequence:1,hasMore:false}));if(init?.method==='POST')return new Response(JSON.stringify({direction:target.direction}));return new Response(JSON.stringify(next?target:original));});
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.events.map(event=>event.id)).toEqual(['old-event']));await act(()=>hook.result.current.activateSource({kind:'empty'}));await waitFor(()=>expect(hook.result.current.events.map(event=>event.id)).toEqual(['next-event']));
 });
 it('a late source creation response cannot repopulate a different account',async()=>{
  mockDirectionApi();const original=vi.mocked(fetch).getMockImplementation()!;let release!:(response:Response)=>void;
  vi.mocked(fetch).mockImplementation(async(path,init)=>init?.method==='POST'?new Promise<Response>(resolve=>{release=resolve;}):original(path,init));
  const hook=renderHook(({userId})=>useWorkspaceAgent({userId,directionId:userId==='one'?'direction':null}),{initialProps:{userId:'one'}});await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));
  let changing!:Promise<void>;act(()=>{changing=hook.result.current.activateSource({kind:'empty'});});await waitFor(()=>expect(release).toBeDefined());hook.rerender({userId:'two'});await waitFor(()=>expect(hook.result.current.localDraft.userId).toBe('two'));
  await act(async()=>{release(new Response(JSON.stringify({direction:{id:'late-old-direction'}})));await expect(changing).rejects.toThrow('account changed');});expect(hook.result.current.directionId).toBeNull();expect(hook.result.current.localDraft.userId).toBe('two');expect(hook.result.current.promptText).toBe('');expect(state.recent.get('two')).not.toBe('late-old-direction');
 });
});

it('v5 import marks migrated only after PATCH succeeds and retries the original direction and patch key',async()=>{
 const original=JSON.stringify({version:5,analysisTaskId:'legacy-analysis',assetId:'legacy-asset',referenceImageUrl:'https://example.test/reference.png',promptText:'local legacy edits',negativePromptText:'',generationParams:{model:'flux-2-dev',aspectRatio:'1:1',quality:'standard'}});
 sessionStorage.setItem('style-gen-workspace-state',original);
 const server=serverDirection();let creates=0,fail=true;const patches:unknown[]=[];
 vi.mocked(fetch).mockImplementation(async(path,init)=>{
  if(init?.method==='POST'){creates++;return new Response(JSON.stringify({direction:server.direction}));}
  if(init?.method==='PATCH'){const body=JSON.parse(init.body as string);patches.push(body);if(fail)return new Response(JSON.stringify({error:'offline'}),{status:503});server.direction.draft.customPrompt=body.changes.find((p:{target:string})=>p.target==='customPrompt').after;server.direction.draftRevision++;return new Response(JSON.stringify({direction:server.direction}));}
  if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));
  return new Response(JSON.stringify(server));
 });
 const first=renderHook(()=>useWorkspaceAgent({userId:'one'}));await waitFor(()=>expect(patches).toHaveLength(1));await waitFor(()=>expect(first.result.current.agentNotice).toBe('offline'));
 expect(state.records.get('onedirection')?.migration?.migrated).toBe(false);expect(sessionStorage.getItem('style-gen-workspace-state')).toBe(original);first.unmount();fail=false;
 const second=renderHook(()=>useWorkspaceAgent({userId:'one'}));await waitFor(()=>expect(state.records.get('onedirection')?.migration?.migrated).toBe(true));expect(creates).toBe(1);expect(patches).toHaveLength(2);expect(patches[1]).toEqual(patches[0]);expect(second.result.current.promptText).toBe('local legacy edits');expect(sessionStorage.getItem('style-gen-workspace-state')).toBe(original);second.unmount();sessionStorage.removeItem('style-gen-workspace-state');
});

it('an attachment waits for source hydration and cannot create a competing empty direction',async()=>{
 let release!:()=>void;const delayed=new Promise<void>(resolve=>{release=resolve});const server=serverDirection();let attached=false;
 vi.mocked(fetch).mockImplementation(async(path)=>{
  if(String(path)==='/api/analysis/slow-source'){await delayed;return new Response(JSON.stringify({id:'slow-source',directionId:'direction'}));}
  if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));
  return new Response(JSON.stringify(server));
 });
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one',source:{kind:'analysis',id:'slow-source'}}));await waitFor(()=>expect(fetch).toHaveBeenCalled());
 let pending!:Promise<boolean>;act(()=>{pending=hook.result.current.attach([new File(['pixels'],'waiting.png',{type:'image/png'})]).then(value=>{attached=true;return value;});});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});expect(attached).toBe(false);
 await act(async()=>{release();await pending;});expect(hook.result.current.localDraft.attachmentName).toBe('waiting.png');
 await act(async()=>{expect(await hook.result.current.ensureDirection()).toBe('direction');});expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
});

it('failed source hydration cannot silently create an empty direction, while explicit new direction remains available',async()=>{
 const server=serverDirection();let creates=0;
 vi.mocked(fetch).mockImplementation(async(path,init)=>{
  if(String(path)==='/api/analysis/unavailable')return new Response(JSON.stringify({error:'Source unavailable'}),{status:503});
  if(init?.method==='POST'){creates++;return new Response(JSON.stringify({direction:server.direction}));}
  if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));
  return new Response(JSON.stringify(server));
 });
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one',source:{kind:'analysis',id:'unavailable'}}));await waitFor(()=>expect(hook.result.current.agentNotice).toBe('Source unavailable'));
 await act(async()=>{await expect(hook.result.current.ensureDirection()).rejects.toThrow('could not be restored');});expect(creates).toBe(0);
 await act(async()=>{await hook.result.current.activateSource({kind:'empty'});});expect(creates).toBe(1);expect(hook.result.current.directionId).toBe('direction');
});

it('an in-flight save cannot acknowledge its old draft into another direction',async()=>{
 const {server}=mockDirectionApi();const original=vi.mocked(fetch).getMockImplementation()!;let release!:(response:Response)=>void;
 vi.mocked(fetch).mockImplementation(async(path,init)=>init?.method==='PATCH'?new Promise<Response>(resolve=>{release=resolve}):String(path)==='/api/workspace/directions/next'?new Response(JSON.stringify({...server,direction:{...server.direction,id:'next'}})):original(path,init));
 const hook=renderHook(({id})=>useWorkspaceAgent({userId:'one',directionId:id}),{initialProps:{id:'direction'}});await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setPromptText('old edits'));
 let pending!:Promise<void>;act(()=>{pending=hook.result.current.saveDraft();});await waitFor(()=>expect(release).toBeDefined());hook.rerender({id:'next'});await waitFor(()=>expect(hook.result.current.directionId).toBe('next'));
 await act(async()=>{release(new Response(JSON.stringify({direction:{...server.direction,draftRevision:1}})));await expect(pending).rejects.toThrow('account changed');});expect(hook.result.current.directionId).toBe('next');expect(hook.result.current.promptText).toBe('');
});

describe('plan-06 durable turn consumption',()=>{
 it('flushes a pending patch before turn, persists the immutable key, and preserves in-flight new text',async()=>{
  const server=serverDirection();const writes:string[]=[];let release!:(response:Response)=>void;
  vi.mocked(fetch).mockImplementation(async(path,init)=>{
   if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],hasMore:false,throughSequence:0}));
   if(init?.method==='PATCH'){writes.push('patch');server.direction.draftRevision++;server.direction.draft.customPrompt=JSON.parse(String(init.body)).changes[0].after;return new Response(JSON.stringify({direction:server.direction}));}
   if(String(path).endsWith('/turns')){writes.push('turn');const body=JSON.parse(String(init!.body));expect(body.baseRevision).toBe(1);expect(body.summaryToken).toBeNull();expect(state.records.get('onedirection')?.turnIntent?.requestKey).toBe(body.requestKey);return new Promise(resolve=>release=resolve);}
   return new Response(JSON.stringify(server));
  });
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));
  act(()=>{hook.result.current.setPromptText('new draft');hook.result.current.setMessage('Original message');});
  let sending!:Promise<void>;act(()=>{sending=hook.result.current.sendTurn();});await waitFor(()=>expect(writes).toEqual(['patch','turn']));
  act(()=>hook.result.current.setMessage('The next thought'));
  const intent=state.records.get('onedirection')!.turnIntent!;
  await act(async()=>{release(new Response(JSON.stringify({event:{id:'turn',requestKey:intent.requestKey,sequence:1,kind:'turn',state:'completed',inputText:intent.text,replyText:'Answer'}})));await sending;});
  expect(hook.result.current.localDraft.text).toBe('The next thought');expect(hook.result.current.localDraft.turnIntent).toBeUndefined();expect(hook.result.current.events[0].replyText).toBe('Answer');
 });
 it('unknown key is read before an explicit resend, and original body survives subsequent edits',async()=>{
  const server=serverDirection();const bodies:unknown[]=[];const order:string[]=[];
  vi.mocked(fetch).mockImplementation(async(path,init)=>{
   if(String(path).includes('/events?requestKey=')){order.push('read');return new Response(JSON.stringify({event:null}));}
   if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],hasMore:false,throughSequence:0}));
   if(String(path).endsWith('/turns')){order.push('write');bodies.push(JSON.parse(String(init!.body)));throw new Error('network lost');}
   return new Response(JSON.stringify(server));
  });
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setMessage('Original'));
  await act(()=>hook.result.current.sendTurn());act(()=>hook.result.current.setMessage('Changed locally'));await act(()=>hook.result.current.sendTurn());
  expect(order).toEqual(['write','read','write']);expect(bodies[1]).toEqual(bodies[0]);expect(hook.result.current.localDraft.text).toBe('Changed locally');
 });
 it('definite preflight rejection unlocks correction and preserves input, without blind auto retry',async()=>{
  const server=serverDirection();let posts=0;
  vi.mocked(fetch).mockImplementation(async(path)=>{if(String(path).endsWith('/turns')){posts++;return new Response(JSON.stringify({code:'INVALID_REFERENCES'}),{status:400});}if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],hasMore:false,throughSequence:0}));return new Response(JSON.stringify(server));});
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setMessage('Preserve this'));await act(()=>hook.result.current.sendTurn());expect(hook.result.current.localDraft.text).toBe('Preserve this');expect(hook.result.current.localDraft.turnIntent).toBeUndefined();expect(posts).toBe(1);
 });
});
it('plan-06 an old direction flight cannot block or unlock the new direction flight',async()=>{
 const responses=new Map<string,(response:Response)=>void>(),bodies=new Map<string,Record<string,unknown>>();
 vi.mocked(fetch).mockImplementation(async(path,init)=>{
  const id=String(path).includes('/second')?'second':'direction';
  if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],hasMore:false,throughSequence:0}));
  if(String(path).endsWith('/turns')){bodies.set(id,JSON.parse(String(init!.body)));return new Promise(resolve=>responses.set(id,resolve));}
  const server=serverDirection();server.direction.id=id;return new Response(JSON.stringify(server));
 });
 const hook=renderHook(({directionId})=>useWorkspaceAgent({userId:'one',directionId}),{initialProps:{directionId:'direction'}});await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setMessage('Old direction'));
 let old!:Promise<void>;act(()=>{old=hook.result.current.sendTurn();});await waitFor(()=>expect(responses.has('direction')).toBe(true));
 hook.rerender({directionId:'second'});await waitFor(()=>expect(hook.result.current.directionId).toBe('second'));expect(hook.result.current.turnSending).toBe(false);act(()=>hook.result.current.setMessage('New direction'));
 let current!:Promise<void>;act(()=>{current=hook.result.current.sendTurn();});await waitFor(()=>expect(responses.has('second')).toBe(true));
 await act(async()=>{responses.get('direction')!(new Response(JSON.stringify({event:{id:'old',requestKey:bodies.get('direction')!.requestKey,sequence:1,kind:'turn',state:'completed',replyText:'Old answer'}})));await old;});
 expect(hook.result.current.turnSending).toBe(true);expect(hook.result.current.events).toHaveLength(0);
 await act(async()=>{responses.get('second')!(new Response(JSON.stringify({event:{id:'new',requestKey:bodies.get('second')!.requestKey,sequence:1,kind:'turn',state:'completed',replyText:'New answer'}})));await current;});expect(hook.result.current.turnSending).toBe(false);expect(hook.result.current.events.map(event=>event.replyText)).toEqual(['New answer']);
});

it('plan-07 command flights are scoped to direction and an old finally cannot release a new flight',async()=>{
 const server=serverDirection();const releases=new Map<string,(r:Response)=>void>();const commands:string[]=[];
 vi.mocked(fetch).mockImplementation(async(path,init)=>{
  const value=String(path),id=value.includes('/next')?'next':'direction';
  if(value.includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));
  if(value.endsWith('/commands')){commands.push(id);return new Promise<Response>(resolve=>releases.set(id,resolve));}
  return new Response(JSON.stringify({...server,direction:{...server.direction,id}}));
 });
 const hook=renderHook(({id})=>useWorkspaceAgent({userId:'one',directionId:id}),{initialProps:{id:'direction'}});await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));
 let first!:Promise<void>,second!:Promise<void>;
 const proposal={id:'proposal',changes:[]} as import('@/lib/workspace/contracts').WorkspaceEvent;
 act(()=>{first=hook.result.current.proposalCommand('discard',proposal);});await waitFor(()=>expect(commands).toEqual(['direction']));
 hook.rerender({id:'next'});await waitFor(()=>expect(hook.result.current.directionId).toBe('next'));act(()=>{second=hook.result.current.proposalCommand('discard',proposal);});await waitFor(()=>expect(commands).toEqual(['direction','next']));
 await act(async()=>{releases.get('direction')!(new Response(JSON.stringify({event:{id:'old'}})));await first;});expect(hook.result.current.commandBusy).toBe(true);expect(hook.result.current.directionId).toBe('next');
 await act(async()=>{releases.get('next')!(new Response(JSON.stringify({event:{id:'current'}})));await second;});expect(hook.result.current.commandBusy).toBe(false);expect(hook.result.current.localDraft.commandIntent).toBeUndefined();
 hook.unmount();
});

it('plan-07 finishing a turn cannot unlock a separate in-flight proposal command',async()=>{
 const server=serverDirection();let finishCommand!:(r:Response)=>void;let finishTurn!:(r:Response)=>void;let commandCount=0;
 vi.mocked(fetch).mockImplementation(async(path)=>{const url=String(path);if(url.includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));if(url.endsWith('/commands')){commandCount++;return new Promise<Response>(resolve=>{finishCommand=resolve;});}if(url.endsWith('/turns'))return new Promise<Response>(resolve=>{finishTurn=resolve;});return new Response(JSON.stringify(server));});
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setMessage('Explain'));let turn!:Promise<void>,command!:Promise<void>;
 act(()=>{turn=hook.result.current.sendTurn();});await waitFor(()=>expect(finishTurn).toBeDefined());const event={id:'p',changes:[]} as import('@/lib/workspace/contracts').WorkspaceEvent;
 act(()=>{command=hook.result.current.proposalCommand('discard',event);});await waitFor(()=>expect(finishCommand).toBeDefined());
 await act(async()=>{finishTurn(new Response(JSON.stringify({event:{id:'turn',requestKey:hook.result.current.localDraft.turnIntent?.requestKey,kind:'turn',state:'completed',sequence:1}})));await turn;});expect(hook.result.current.commandBusy).toBe(true);
 await act(()=>hook.result.current.proposalCommand('discard',event));expect(commandCount).toBe(1);
 await act(async()=>{finishCommand(new Response(JSON.stringify({event:{id:'command'}})));await command;});hook.unmount();
});

describe('plan-08 display and quick lifecycle',()=>{
 it('GET alone cannot authorize a language request; displayed snapshot can and edits invalidate it',async()=>{
  const server=serverDirection();Object.assign(server.direction.draft,{customPrompt:'Visible draft'});const calls:Record<string,unknown>[]=[];
  vi.mocked(fetch).mockImplementation(async(path,init)=>{if(String(path).endsWith('/turns')){const body=JSON.parse(String(init?.body));calls.push(body);return new Response(JSON.stringify({event:{id:'turn-'+calls.length,requestKey:body.requestKey,kind:'turn',state:'completed',inputText:body.text,sequence:calls.length}}));}return new Response(JSON.stringify(String(path).includes('/events')?{items:[],hasMore:false,throughSequence:0}:server));});
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setMessage('Generate one image'));await act(()=>hook.result.current.sendTurn());expect(calls[0].summaryToken).toBeNull();act(()=>hook.result.current.markSummaryDisplayed(hook.result.current.generationSummary!));act(()=>hook.result.current.setMessage('Generate one image'));await act(()=>hook.result.current.sendTurn());expect(calls[1].summaryToken).toBe('token');
 });
 it('restoring armed server authorization clears it without executing analysis or generation',async()=>{
  const server={...serverDirection(),direction:{...serverDirection().direction,quickState:'armed',quickAuthorizationId:'old',quickActivationId:'old-page',authorizationEpoch:1}};const writes:Record<string,unknown>[]=[];
  vi.mocked(fetch).mockImplementation(async(path,init)=>{if(init?.method==='POST'){writes.push(JSON.parse(String(init.body)));return new Response(JSON.stringify({direction:{...server.direction,quickState:'none'},event:{id:'clear'}}));}return new Response(JSON.stringify(String(path).includes('/events')?{items:[],hasMore:false,throughSequence:0}:server));});
  const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));expect(writes).toHaveLength(1);expect(writes[0].action).toBe('clearQuick');expect(hook.result.current.quickArmed).toBe(false);expect(vi.mocked(fetch).mock.calls.some(([path])=>String(path)==='/api/generation')).toBe(false);
 });
});

it('plan-08 accepted analysis only removes the exact sent attachment, preserves original and newer goals',async()=>{
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one'}));await waitFor(()=>expect(hook.result.current.saveState).toBe('local'));await act(()=>hook.result.current.attach([new File(['a'],'a.png',{type:'image/png'})]));act(()=>hook.result.current.setMessage('original goal'));const original=hook.result.current.captureAnalysisAttachment();act(()=>hook.result.current.acceptAnalysisAttachment(original));expect(hook.result.current.localDraft.text).toBe('original goal');expect(hook.result.current.localDraft.attachment).toBeNull();await act(()=>hook.result.current.attach([new File(['b'],'b.png',{type:'image/png'})]));act(()=>hook.result.current.setMessage('next goal'));act(()=>hook.result.current.acceptAnalysisAttachment(original));expect(hook.result.current.localDraft.text).toBe('next goal');expect(hook.result.current.localDraft.attachmentName).toBe('b.png');
});
it('plan-08 late generation A cannot overwrite or release the newer B flight',async()=>{
 const responses=new Map<string,(value:Response)=>void>();let posts=0;
 vi.mocked(fetch).mockImplementation(async(path,init)=>{
  if(String(path)==='/api/generation'&&init?.method==='POST'){posts++;const body=JSON.parse(String(init.body));return new Promise<Response>(resolve=>responses.set(body.directionId,resolve));}
  const id=String(path).includes('/B')?'B':'A';const server=serverDirection();Object.assign(server.direction,{id});Object.assign(server.direction.draft,{customPrompt:'Visible prompt'});
  return new Response(JSON.stringify(String(path).includes('/events')?{items:[],hasMore:false,throughSequence:0}:server));
 });
 const hook=renderHook(({directionId})=>useWorkspaceAgent({userId:'one',directionId}),{initialProps:{directionId:'A'}});await waitFor(()=>expect(hook.result.current.directionId).toBe('A'));act(()=>hook.result.current.markSummaryDisplayed(hook.result.current.generationSummary!));let first!:Promise<unknown>;act(()=>{first=hook.result.current.sendGeneration();});await waitFor(()=>expect(posts).toBe(1));hook.rerender({directionId:'B'});await waitFor(()=>expect(hook.result.current.directionId).toBe('B'));act(()=>hook.result.current.markSummaryDisplayed(hook.result.current.generationSummary!));let second!:Promise<unknown>;act(()=>{second=hook.result.current.sendGeneration();});await waitFor(()=>expect(posts).toBe(2));await act(async()=>{responses.get('A')!(new Response(JSON.stringify({id:'A-task'})));await first;});expect(hook.result.current.generationTaskId).not.toBe('A-task');expect(hook.result.current.generationNetworkBusy).toBe(true);await act(()=>hook.result.current.sendGeneration());expect(posts).toBe(2);await act(async()=>{responses.get('B')!(new Response(JSON.stringify({id:'B-task'})));await second;});expect(hook.result.current.generationTaskId).toBe('B-task');expect(hook.result.current.generationNetworkBusy).toBe(false);
});
it('plan-08 quick rechecks new input after its durable flush and never submits that authorization',async()=>{
 const server=serverDirection() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
 const posts:string[]=[];let release!:()=>void;
 vi.mocked(fetch).mockImplementation(async(path,init)=>{
  if(String(path).endsWith('/commands')){const body=JSON.parse(String(init?.body));posts.push(body.action);if(body.action==='armQuick')Object.assign(server.direction,{quickState:'armed',quickAuthorizationId:'auth',quickActivationId:body.activationId,authorizationEpoch:1});else server.direction.quickState='none';return new Response(JSON.stringify({direction:server.direction}));}
  if(String(path)==='/api/generation'){posts.push('generation');return new Response(JSON.stringify({id:'unexpected'}));}
  return new Response(JSON.stringify(String(path).includes('/events')?{items:[],hasMore:false,throughSequence:0}:server));
 });
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));
 await act(()=>hook.result.current.attach([new File(['pixels'],'ref.png',{type:'image/png'})]));act(()=>hook.result.current.rememberUpload({assetId:'asset',fileUrl:'https://example.com/ref.png',mimeType:'image/png'}));await act(()=>hook.result.current.armQuick());
 const requestKey=hook.result.current.localDraft.requestKeys.analysis!;
 act(()=>hook.result.current.acceptQuickAnalysisReceipt('analysis',{requestKey,assetId:'asset'}));expect(hook.result.current.localDraft.attachment).toBeNull();
 Object.assign(server.direction,{analysisTaskId:'analysis',sourceAssetId:'asset'});server.source.analysisStatus='completed';
 state.writeGate=async value=>{if(value.generationIntent){state.writeGate=null;await new Promise<void>(resolve=>release=resolve);}};
 await act(()=>hook.result.current.refreshDirection());await waitFor(()=>expect(release).toBeDefined());act(()=>hook.result.current.setMessage('My next thought'));
 await act(async()=>{release();});await waitFor(()=>expect(hook.result.current.generationNetworkBusy).toBe(false));expect(hook.result.current.localDraft.text).toBe('My next thought');expect(hook.result.current.localDraft.generationIntent).toBeUndefined();expect(posts).toEqual(['armQuick','clearQuick']);
});
for(const change of ['message','parameter'] as const)it(`plan-08 current ${change} edits during durable intent flush block its first POST`,async()=>{
 const server=serverDirection();Object.assign(server.direction.draft,{customPrompt:'Shown prompt'});let release!:()=>void;let posts=0;
 vi.mocked(fetch).mockImplementation(async(path,init)=>{if(String(path)==='/api/generation'&&init?.method==='POST')posts++;return new Response(JSON.stringify(String(path).includes('/events')?{items:[],hasMore:false,throughSequence:0}:server));});
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.markSummaryDisplayed(hook.result.current.generationSummary!));state.writeGate=async value=>{if(value.generationIntent){state.writeGate=null;await new Promise<void>(resolve=>release=resolve);}};
 let sending!:Promise<unknown>;act(()=>{sending=hook.result.current.sendGeneration();});await waitFor(()=>expect(release).toBeDefined());act(()=>{if(change==='message')hook.result.current.setMessage('A newer message');else hook.result.current.setGenerationParams({...hook.result.current.generationParams,aspectRatio:'16:9'});});await act(async()=>{release();await sending;});expect(posts).toBe(0);expect(hook.result.current.localDraft.generationIntent).toBeUndefined();expect(hook.result.current.agentNotice).toContain('changed');
});
it('plan-08 switching URL directions invalidates the old page authorization and its late receipt',async()=>{
 const server=serverDirection() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
 const actions:string[]=[];
 vi.mocked(fetch).mockImplementation(async(path,init)=>{if(String(path).endsWith('/commands')){const body=JSON.parse(String(init?.body));actions.push(body.action);Object.assign(server.direction,{quickState:body.action==='armQuick'?'armed':'none',quickAuthorizationId:'auth',authorizationEpoch:1});return new Response(JSON.stringify({direction:server.direction}));}return new Response(JSON.stringify(String(path).includes('/events')?{items:[],hasMore:false,throughSequence:0}:String(path).includes('/next')?{...serverDirection(),direction:{...serverDirection().direction,id:'next'}}:server));});
 const hook=renderHook(({id})=>useWorkspaceAgent({userId:'one',directionId:id}),{initialProps:{id:'direction'}});await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));await act(()=>hook.result.current.attach([new File(['x'],'ref.png',{type:'image/png'})]));act(()=>hook.result.current.rememberUpload({assetId:'asset',fileUrl:'https://example.com/ref.png',mimeType:'image/png'}));await act(()=>hook.result.current.armQuick());const key=hook.result.current.localDraft.requestKeys.analysis!;hook.rerender({id:'next'});await waitFor(()=>expect(hook.result.current.directionId).toBe('next'));act(()=>hook.result.current.acceptQuickAnalysisReceipt('old-analysis',{requestKey:key,assetId:'asset'}));expect(actions).toEqual(['armQuick','clearQuick']);expect(hook.result.current.quickArmed).toBe(false);expect(hook.result.current.localDraft.generationIntent).toBeUndefined();
});

it('preferred result PATCH is isolated from unsaved prompt edits and preserves them for explicit save',async()=>{
 const server=serverDirection();const requests:Record<string,unknown>[]=[];
 vi.mocked(fetch).mockImplementation(async(path,init)=>{if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));if(init?.method==='PATCH'){const body=JSON.parse(String(init.body));requests.push(body);Object.assign(server.direction,{preferredIterationId:body.preferredIterationId,draftRevision:server.direction.draftRevision+1});return new Response(JSON.stringify({direction:server.direction}));}return new Response(JSON.stringify(server));});
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));act(()=>hook.result.current.setPromptText('Unsaved expert text'));await act(()=>hook.result.current.flushLocal());await act(()=>hook.result.current.savePreferred('result-one'));
 expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({preferredIterationId:'result-one',baseRevision:0});expect(requests[0]).not.toHaveProperty('changes');expect(hook.result.current.promptText).toBe('Unsaved expert text');expect(server.direction.draft.customPrompt).toBeNull();expect(hook.result.current.localDraft.pendingSave?.changes).toEqual(expect.arrayContaining([expect.objectContaining({after:'Unsaved expert text'})]));expect(hook.result.current.localDraft.pendingSave?.baseRevision).toBe(1);
});

it('a pending preference write blocks draft submission and keeps its frozen key on retry',async()=>{
 const server=serverDirection();let release!:()=>void;const bodies:Record<string,unknown>[]=[];
 vi.mocked(fetch).mockImplementation(async(path,init)=>{if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));if(init?.method==='PATCH'){bodies.push(JSON.parse(String(init.body)));await new Promise<void>(r=>release=r);Object.assign(server.direction,{preferredIterationId:'old',draftRevision:1});return new Response(JSON.stringify({direction:server.direction}));}return new Response(JSON.stringify(server));});
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));let pending!:Promise<void>;act(()=>{pending=hook.result.current.savePreferred('old');});await waitFor(()=>expect(release).toBeDefined());act(()=>hook.result.current.setPromptText('new edit during preference'));
 await act(async()=>{await expect(hook.result.current.saveDraft()).rejects.toThrow('preferred result');});expect(bodies).toHaveLength(1);await act(async()=>{release();await pending;});expect(hook.result.current.promptText).toBe('new edit during preference');expect(hook.result.current.localDraft.pendingSave?.attempted).not.toBe(true);
});
it('source preview becomes stale when local text changes and cannot create a direction',async()=>{
 const api=mockDirectionApi();const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));await act(()=>hook.result.current.previewSource('empty'));act(()=>hook.result.current.setMessage('changed after preview'));await act(async()=>{await expect(hook.result.current.confirmSource()).rejects.toThrow('draft changed');});expect(api.bodies).toHaveLength(0);expect(vi.mocked(fetch).mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);
});
it('late preference completion from A cannot block or unlock B preference submission',async()=>{
 const a=serverDirection(),b=serverDirection();b.direction.id='direction-b';let releaseA!:()=>void,releaseB!:()=>void;const writes:string[]=[];
 vi.mocked(fetch).mockImplementation(async(path,init)=>{const isB=String(path).includes('direction-b'),server=isB?b:a;if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));if(init?.method==='PATCH'){writes.push(isB?'B':'A');await new Promise<void>(resolve=>{if(isB)releaseB=resolve;else releaseA=resolve;});Object.assign(server.direction,{preferredIterationId:isB?'result-b':'result-a',draftRevision:1});return new Response(JSON.stringify({direction:server.direction}));}return new Response(JSON.stringify(server));});
 const hook=renderHook(({directionId})=>useWorkspaceAgent({userId:'one',directionId}),{initialProps:{directionId:'direction'}});await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));let pendingA!:Promise<unknown>,pendingB!:Promise<void>;act(()=>{pendingA=hook.result.current.savePreferred('result-a').catch(error=>error);});await waitFor(()=>expect(releaseA).toBeDefined());hook.rerender({directionId:'direction-b'});await waitFor(()=>expect(hook.result.current.directionId).toBe('direction-b'));act(()=>{pendingB=hook.result.current.savePreferred('result-b');});await waitFor(()=>expect(releaseB).toBeDefined());await act(async()=>{releaseA();await pendingA;});await act(()=>hook.result.current.savePreferred('result-b'));expect(writes).toEqual(['A','B']);await act(async()=>{releaseB();await pendingB;});expect(hook.result.current.directionId).toBe('direction-b');expect(hook.result.current.preferredIterationId).toBe('result-b');
});
for(const phase of ['persist','create'] as const)it(`source continuation preserves edits during ${phase} and reuses its original transition key`,async()=>{
 const current=serverDirection();const next={...serverDirection(),direction:{...serverDirection().direction,id:'continued'}};
 let release!:()=>void;const keys:string[]=[];
 vi.mocked(fetch).mockImplementation(async(path,init)=>{
  if(String(path).includes('/events'))return new Response(JSON.stringify({items:[],throughSequence:0,hasMore:false}));
  if(String(path)==='/api/workspace/directions'&&init?.method==='POST'){keys.push(JSON.parse(String(init.body)).requestKey);if(phase==='create'&&keys.length===1)await new Promise<void>(resolve=>release=resolve);return new Response(JSON.stringify({direction:next.direction}));}
  return new Response(JSON.stringify(String(path).endsWith('/continued')?next:current));
 });
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one',directionId:'direction'}));await waitFor(()=>expect(hook.result.current.directionId).toBe('direction'));
 await act(()=>hook.result.current.previewSource('empty'));
 if(phase==='persist')state.writeGate=async value=>{if(value.transition){state.writeGate=null;await new Promise<void>(resolve=>release=resolve);}};
 let pending!:Promise<unknown>;act(()=>{pending=hook.result.current.confirmSource().catch(error=>error);});await waitFor(()=>expect(release).toBeDefined());
 act(()=>hook.result.current.setMessage('New input while continuing'));
 await act(async()=>{release();await pending;});
 expect(hook.result.current.directionId).toBe('direction');expect(hook.result.current.localDraft.text).toBe('New input while continuing');
 const key=hook.result.current.localDraft.transition!.requestKey;
 expect(keys).toHaveLength(phase==='persist'?0:1);
 if(phase==='create')expect(hook.result.current.localDraft.transition?.createdDirectionId).toBe('continued');
 await act(()=>hook.result.current.previewSource('empty'));await act(()=>hook.result.current.confirmSource());
 expect(hook.result.current.directionId).toBe('continued');expect(keys.every(value=>value===key)).toBe(true);
 expect(state.records.get('onedirection')?.text).toBe('New input while continuing');
});

it('appends three references, preserves their uploads across restore and removes individually',async()=>{
 const hook=renderHook(()=>useWorkspaceAgent({userId:'one'}));
 await waitFor(()=>expect(hook.result.current.saveState).toBe('local'));
 const files=['one','two','three'].map(name=>new File(['pixels'],`${name}.png`,{type:'image/png'}));
 await act(()=>hook.result.current.attach(files.slice(0,2),true));
 await act(()=>hook.result.current.attach(files.slice(2),true));
 expect(hook.result.current.getAttachments().map(item=>item.name)).toEqual(['one.png','two.png','three.png']);
 await act(()=>hook.result.current.attach([new File(['x'],'four.png',{type:'image/png'})],true));
 expect(hook.result.current.getAttachments()).toHaveLength(3);
 expect(hook.result.current.agentNotice).toContain('3');
 act(()=>hook.result.current.rememberAttachmentUpload(files[1],{assetId:'two',fileUrl:'https://example.test/two.png',width:20,height:20,mimeType:'image/png'}));
 act(()=>hook.result.current.removeAttachment(files[0]));
 expect(hook.result.current.localDraft.attachmentName).toBe('two.png');
 expect(hook.result.current.getUploaded()?.assetId).toBe('two');
 await act(()=>hook.result.current.flushLocal());
 hook.unmount();
 const restored=renderHook(()=>useWorkspaceAgent({userId:'one'}));
 await waitFor(()=>expect(restored.result.current.getAttachments()).toHaveLength(2));
 expect(restored.result.current.getAttachments()[0].uploaded?.assetId).toBe('two');
});
