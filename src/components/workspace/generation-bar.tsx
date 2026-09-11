"use client";
import { useEffect, useRef } from 'react';
import { IMAGE_GEN_MODEL_OPTIONS } from '@/lib/ai/model-config';
import { SUPPORTED_ASPECT_RATIOS } from '@/lib/generation/aspect-ratio';
import type { GenerationParams } from '@/types/models';

export interface GenerationSummary { directionId:string;token:string; revision:number; prompt:string; negative:string; params:GenerationParams; binding?:string }
interface Props {
 params:GenerationParams; onParamsChange:(params:GenerationParams)=>void;
 summary:GenerationSummary|null;
 reason:string|null; onRepair:()=>void; repairLabel:string;
 onGenerate:()=>void; busy:boolean; unknown:boolean; onCheck:()=>void;
 onConfirmOriginal?:()=>void;retryBlocked?:boolean;retrySummary?:GenerationSummary|null; onRetryOriginal?:()=>void; onRetryDisplayed?:(summary:GenerationSummary)=>void;
 submittedSummary?:Omit<GenerationSummary,'token'>|null;failed?:boolean; error?:string|null;
}
function Summary({value,onDisplayed,label}:{value:GenerationSummary;onDisplayed:(value:GenerationSummary)=>void;label:string}){
 const element=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const current=element.current;if(!current)return;
  let visible=false;
  const show=()=>{if(visible&&document.visibilityState==='visible')onDisplayed(value);};
  const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=1);show();},{threshold:1});observer.observe(current);document.addEventListener('visibilitychange',show);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',show);};
 },[value,onDisplayed]);
 return <div ref={element} aria-label={label} className="min-w-0 text-xs text-[var(--text-secondary)]"><p>{label}: revision {value.revision}. {value.params.model}, {value.params.aspectRatio}, {value.params.quality}, 1 image{value.binding?`. ${value.binding}`:''}.</p><p className="max-h-16 overflow-y-auto whitespace-pre-wrap break-words">{value.prompt}</p><p>Negative prompt: {value.negative||'None'}. Preserved in the snapshot; not applied separately by the current binding.</p></div>;
}
export function GenerationBar(props:Props){
 const {params,summary,reason,busy,unknown}=props;
 const control='min-w-0 max-w-full rounded-xl border border-[var(--border-static)] bg-[var(--surface-panel)] px-2 py-1.5 text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]';
 return <section id="generation-bar" tabIndex={-1} aria-label="Generation settings and actions" data-testid="generation-bar" data-readiness-can-generate={String(!reason&&!busy&&!unknown&&!!summary)} className="min-w-0 space-y-2 bg-[var(--surface-panel)] pt-3">
  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-end gap-2">
   <label className="grid min-w-0 max-w-full gap-1 text-xs">Model<select aria-label="Model" className={control} value={params.model} onChange={e=>props.onParamsChange({...params,model:e.target.value})}>{!IMAGE_GEN_MODEL_OPTIONS.some(m=>m.id===params.model)&&<option value={params.model}>{params.model} - unavailable</option>}{IMAGE_GEN_MODEL_OPTIONS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
   <label className="grid min-w-0 max-w-full gap-1 text-xs">Aspect ratio<select aria-label="Aspect ratio" className={control} value={params.aspectRatio} onChange={e=>props.onParamsChange({...params,aspectRatio:e.target.value})}>{!SUPPORTED_ASPECT_RATIOS.some(r=>r===params.aspectRatio)&&<option value={params.aspectRatio}>{params.aspectRatio||"Missing"} - choose a ratio</option>}{SUPPORTED_ASPECT_RATIOS.map(r=><option key={r}>{r}</option>)}</select></label>
   <label className="grid min-w-0 max-w-full gap-1 text-xs">Quality<select aria-label="Quality" className={`${control}`} value={params.quality} onChange={e=>props.onParamsChange({...params,quality:e.target.value})}><option value="standard">Standard</option><option value="hd" disabled>HD - unsupported, select Standard</option></select></label>
   <button className="btn-primary col-span-3 justify-self-end rounded-[10px] px-3 py-2 text-[0.8125rem]" title={reason??'Generate with the displayed current draft.'} disabled={!!reason||busy||unknown||!summary} onClick={props.onGenerate}>{busy?'Generating 1 image':props.failed?'Generate current draft':'Generate 1 image'}</button>
  </div>
  {props.submittedSummary&&<div aria-label="Fixed submission record" className="text-xs text-[var(--text-secondary)]"><p>Submitted revision {props.submittedSummary.revision}: {props.submittedSummary.params.model}, {props.submittedSummary.params.aspectRatio}, {props.submittedSummary.params.quality}. {props.submittedSummary.binding}</p><p className="max-h-16 overflow-y-auto whitespace-pre-wrap break-words">{props.submittedSummary.prompt}</p></div>}
  {busy&&<p className="text-xs">The submitted snapshot is fixed. You can edit or discuss the next round; another image waits for this task.</p>}
  {props.error&&<p role="alert" className="text-xs">{props.error}</p>}
  {unknown&&<button className="btn-secondary rounded-xl px-3 py-2 text-xs" onClick={props.onCheck}>Check original submission</button>}
  {props.onConfirmOriginal&&<button className="btn-secondary rounded-xl px-3 py-2 text-xs" onClick={props.onConfirmOriginal}>Confirm original submission</button>}
  {props.failed&&<div className="space-y-1">{props.retrySummary&&props.onRetryDisplayed&&<Summary value={props.retrySummary} onDisplayed={props.onRetryDisplayed} label="Original submission summary"/>}<button className="btn-secondary rounded-xl px-3 py-2 text-xs" disabled={!props.retrySummary||props.retryBlocked||busy||unknown} onClick={props.onRetryOriginal}>Retry original submission</button>{!props.retrySummary&&<p className="text-xs">Original binding is unavailable or its summary needs refreshing. Select valid settings for the current draft.</p>}</div>}

  </section>;
}
