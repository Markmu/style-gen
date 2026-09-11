"use client";
import {useCallback} from 'react';
import {useRouter} from 'next/navigation';
import type {IterationDetail} from '@/types/models';
export interface PendingIterationReplace {target:IterationDetail;currentPrompt:string;reason:string}
/** Full history prepares a read-only intent. The canonical Workspace owner hydrates
 * the original local direction and shows the complete source/unsaved guard there. */
export function useIterationRestore(){
 const router=useRouter();
 const restore=useCallback((target:IterationDetail)=>{router.push(`/workspace?previewIterationId=${encodeURIComponent(target.id)}`);},[router]);
 const cancelReplace=useCallback(()=>{},[]);
 return {restore,pendingReplace:null as PendingIterationReplace|null,confirmReplace:cancelReplace,cancelReplace};
}
