import {afterEach,describe,expect,it,vi} from 'vitest';
import {createDraftWriter,validateAttachments,type DraftStorage,type LocalWorkspaceDraft} from '../draft-store';
const draft=(text:string):LocalWorkspaceDraft=>({userId:'one',directionId:'direction',text,attachment:null,attachmentName:null,pendingSave:null,requestKeys:{analysis:'same-key'},lastViewed:1});
afterEach(()=>vi.useRealTimers());
describe('local draft writer',()=>{
 it('debounces edits and awaits the latest complete transaction before navigation',async()=>{
  vi.useFakeTimers();const write=vi.fn(async()=>{});const storage={write,read:vi.fn(),recent:vi.fn()} as DraftStorage;
  const writer=createDraftWriter(storage);writer.schedule(draft('first'));await vi.advanceTimersByTimeAsync(299);expect(write).not.toHaveBeenCalled();writer.schedule(draft('latest'));await writer.flush();expect(write).toHaveBeenCalledOnce();expect(write.mock.calls[0][0].text).toBe('latest');await vi.advanceTimersByTimeAsync(400);expect(write).toHaveBeenCalledOnce();
 });
 it('serializes flushes and cannot let an older write win',async()=>{
  let release!:()=>void;const values:string[]=[];let calls=0;
  const storage={read:vi.fn(),recent:vi.fn(),write:async(value:LocalWorkspaceDraft)=>{if(calls++===0)await new Promise<void>(r=>release=r);values.push(value.text);}};
  const writer=createDraftWriter(storage);writer.schedule(draft('old'));const first=writer.flush();await Promise.resolve();await Promise.resolve();writer.schedule(draft('new'));const second=writer.flush();release();await Promise.all([first,second]);expect(values).toEqual(['old','new']);
 });
 it('rejects failed storage without claiming saved and permits later explicit recovery',async()=>{
  const failed=vi.fn(),saved=vi.fn(),write=vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
  const writer=createDraftWriter({write,read:vi.fn(),recent:vi.fn()},failed,300,saved);writer.schedule(draft('keep'));await expect(writer.flush()).rejects.toThrow('quota');expect(saved).not.toHaveBeenCalled();expect(failed).toHaveBeenCalledOnce();writer.schedule(draft('keep'));await writer.flush();expect(saved).toHaveBeenCalledOnce();
 });
 it('preserves Blob and keys in the persisted record',async()=>{
  const write=vi.fn(async()=>{});const writer=createDraftWriter({write,read:vi.fn(),recent:vi.fn()});writer.schedule({...draft('goal'),attachment:new Blob(['pixels'],{type:'image/png'})});await writer.flush();expect(write.mock.calls[0][0].attachment).toBeInstanceOf(Blob);expect(write.mock.calls[0][0].requestKeys.analysis).toBe('same-key');
 });
 it('rejects multiple, unsupported and oversized files',()=>{
  const png=new File(['x'],'image.png',{type:'image/png'});expect(validateAttachments([png])).toBeNull();expect(validateAttachments([png,png])).toContain('one');expect(validateAttachments([new File(['x'],'x.svg',{type:'image/svg+xml'})])).toContain('JPG');expect(validateAttachments([new File([new Uint8Array(10485761)],'big.png',{type:'image/png'})])).toContain('10 MB');
 });
});

it('accepts up to three images and validates every file',()=>{
 const png=new File(['x'],'one.png',{type:'image/png'});
 expect(validateAttachments([png,png,png],3)).toBeNull();
 expect(validateAttachments([png,png,png,png],3)).toContain('3');
 expect(validateAttachments([png,new File(['x'],'bad.svg',{type:'image/svg+xml'})],3)).toContain('JPG');
 expect(validateAttachments([png,new File([new Uint8Array(10485761)],'big.png',{type:'image/png'})],3)).toContain('10 MB');
});
