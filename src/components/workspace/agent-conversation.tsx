'use client';
import { useState } from 'react';
import type { DraftPatch, WorkspaceEvent } from '@/lib/workspace/contracts';

const VISORYN_LABEL = <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Visoryn</p>;

interface Props {onProposal?:(action:'apply'|'discard'|'undo',event:WorkspaceEvent,changes?:DraftPatch[])=>Promise<void>;onRepropose?:(event:WorkspaceEvent)=>void;revision?:number;commandBusy?:boolean;events:WorkspaceEvent[];hasEarlier:boolean;onEarlier:()=>void;onRetry:(event:WorkspaceEvent)=>void;onCheck:()=>void;onResend:()=>void;pendingText?:string;busy:boolean;paused:boolean}
export function AgentConversation({events,hasEarlier,onEarlier,onRetry,onCheck,onResend,pendingText,busy,paused,onProposal,onRepropose,revision,commandBusy}:Props) {
 const messages=events.filter(event=>event.kind==='turn'||event.replyText);
 if(!messages.length&&!pendingText)return (
 <div data-testid="conversation-empty" className="pt-1">
  {VISORYN_LABEL}
  <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">Start with a reference.</p>
  <p className="mt-2 max-w-[52ch] text-sm leading-6 text-[var(--text-secondary)]">Tell me what to keep, and what to change. Attach a reference below, describe your goal, and I will turn it into a new direction before anything is generated.</p>
  <p className="mt-4 text-xs text-[var(--text-muted)]">Evidence and results stay in view on the right as the conversation moves forward.</p>
 </div>
);
 return <div role="log" aria-label="Direction messages" aria-live="polite" className={`mb-2 space-y-[23px] leading-[1.55] text-[0.8125rem] text-[var(--text-primary)]`}>
  {hasEarlier&&<button type="button" className="self-start underline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]" onClick={onEarlier}>Load earlier messages</button>}
  {messages.map(event=><article key={event.id} aria-label="Conversation turn" className="space-y-2">
   {event.kind==='turn'&&event.inputText&&<p className="ml-[30px] whitespace-pre-wrap break-words rounded-[13px_13px_3px_13px] bg-[var(--surface-low)] px-3.5 py-3">{event.inputText}</p>}
   {event.replyText&&<div className="space-y-1"><p className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Visoryn</p><p className="max-w-[75ch] whitespace-pre-wrap break-words">{event.replyText}</p></div>}
   {event.state==='processing'&&<p className="text-[var(--text-secondary)]">Interpreting your message...</p>}
   {event.responseKind==='proposal'&&<p className="text-[var(--text-secondary)]">{event.proposalState==='stale'?'This proposal refers to an earlier draft.':event.proposalState==='applied'?'Original suggestion. See the application receipt for the changes you applied.':event.proposalState==='discarded'?'This proposal was discarded.':'Suggested changes are pending review. Your draft has not changed.'}</p>}
   {onProposal&&(event.responseKind==='proposal'||(event.kind==='draft_change'&&event.inputText?.includes('proposalUndo')))&&<ProposalControls key={event.id} event={event} onProposal={onProposal} onRepropose={onRepropose} revision={revision} busy={!!commandBusy||paused} />}
   {event.choices?.length>0&&<ul className="list-inside list-disc">{event.choices.map(choice=><li key={choice}>{choice}</li>)}</ul>}
   {event.state==='failed'&&<div className="text-[var(--text-secondary)]"><p>Message failed ({event.errorCode}). Your draft is unchanged.</p><button type="button" disabled={busy||paused} onClick={()=>onRetry(event)} className="underline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]">Retry message</button></div>}
  </article>)}
  {pendingText&&<article aria-label="Unconfirmed message"><p className="ml-[30px] whitespace-pre-wrap break-words rounded-[13px_13px_3px_13px] bg-[var(--surface-low)] px-3.5 py-3">{pendingText}</p><p className="mt-1 text-[var(--text-secondary)]">{busy?'Sending message...':'Message status is unconfirmed.'}</p>{!busy&&<div className="flex gap-3"><button type="button" disabled={paused} className="underline" onClick={onCheck}>Check message status</button><button type="button" disabled={paused} className="underline" onClick={onResend}>Confirm original message</button></div>}</article>}
 </div>;
}

function ProposalControls({event,onProposal,onRepropose,revision,busy}:{event:WorkspaceEvent;onProposal:NonNullable<Props['onProposal']>;onRepropose:Props['onRepropose'];revision?:number;busy:boolean}){
 const [editing,setEditing]=useState(false),[copy,setCopy]=useState<DraftPatch[]>(()=>structuredClone(event.changes));
 const [error,setError]=useState<string|null>(null);
 const act=async(action:'apply'|'discard'|'undo')=>{try{await onProposal(action,event,copy);setCopy(structuredClone(event.changes));setEditing(false);setError(null);}catch(e){setError((e as Error).message);}};
 const pending=event.proposalState==='pending'&&event.baseRevision===revision;
 const receipt=event.kind==='draft_change'&&event.inputText?.includes('proposalUndo');
 return <section aria-label="Proposal changes" className="w-fit max-w-full space-y-2 rounded-2xl border border-[var(--border-static)] bg-[var(--surface-panel)] p-4">
  <div className="flex items-center justify-between gap-3">
   <h3 className="text-sm font-semibold text-[var(--text-primary)]">{receipt?'Applied to the current draft':'Next image'}</h3>
   {revision!=null&&<span className="rounded-md bg-[var(--surface-bright)] px-1.5 py-0.5 text-[0.6875rem] text-[var(--text-secondary)]">Draft {revision}</span>}
  </div>
  <p className="text-xs text-[var(--text-secondary)]">{receipt?'Applied changes: these are the exact values accepted by the server.':'Only the listed fields change. Other fields stay as they are. Changes affect the next image.'}</p>
  {copy.map((patch,index)=><div key={`${patch.target}:${patch.key}`} className="space-y-1"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{patch.key||patch.target}</p><div className="grid gap-2 sm:grid-cols-2"><div><p className="text-xs text-[var(--text-secondary)]">Before</p><pre className="whitespace-pre-wrap break-words font-sans">{patch.before??'(Not set)'}</pre></div><div><p className="text-xs text-[var(--text-secondary)]">After</p>{editing&&patch.after!==null?<textarea aria-label={`Proposed ${patch.key||patch.target}`} className="input-precision w-full" value={patch.after} onChange={e=>setCopy(current=>current.map((p,i)=>i===index?{...p,after:e.target.value,...(p.target==='invariant'?{action:'replace' as const}:{})}:p))}/>:<pre className="whitespace-pre-wrap break-words font-sans">{patch.after??'(Removed)'}</pre>}</div></div></div>)}
  {event.proposalState==='applied'&&<p>Applied at revision {event.resultingRevision}</p>}
  {event.proposalState==='discarded'&&<p>Discarded. Your draft was not changed.</p>}
  <div className="flex flex-wrap gap-2">
   {pending&&<><button className="btn-secondary rounded-lg px-3 py-1" disabled={busy} onClick={()=>{setCopy(structuredClone(event.changes));setEditing(!editing);}}>{editing?'Cancel proposal edit':'Edit draft'}</button><button className="btn-primary rounded-lg px-3 py-1" disabled={busy} onClick={()=>void act('apply')}>Apply proposal</button></>}
   {['pending','stale'].includes(event.proposalState)&&<button className="btn-secondary rounded-lg px-3 py-1" disabled={busy} onClick={()=>void act('discard')}>Discard proposal</button>}
   {receipt&&<button className="btn-secondary rounded-lg px-3 py-1" disabled={busy||revision!==event.resultingRevision} onClick={()=>void act('undo')}>Undo changes</button>}
   {((event.proposalState==='stale'||event.proposalState==='pending'&&!pending)||(receipt&&revision!==event.resultingRevision)||error)&&onRepropose&&<button className="btn-secondary rounded-lg px-3 py-1" disabled={busy} onClick={()=>onRepropose(event)}>Request latest comparison</button>}
  </div>
  {receipt&&revision!==event.resultingRevision&&<p>Later edits prevent direct Undo. Review a new recovery proposal against the latest draft.</p>}
  {error&&<p role="alert">{error}. Your draft is preserved.</p>}
 </section>;
}
