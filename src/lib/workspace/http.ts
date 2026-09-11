import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { WorkspaceConflict, WorkspaceNotFound } from '@/lib/repositories/workspace-repository';
import { WorkspaceServiceError } from './validation';
export async function workspaceHttp(run:(userId:string)=>Promise<unknown>,method='GET') {
  const start=performance.now();
  try {
    const session=await auth();if(!session?.user?.id)return NextResponse.json({code:'UNAUTHORIZED',retryable:false,preservedContext:true},{status:401});
    const value=await run(session.user.id);
    if(method!=='GET') {
      const result=value as {direction?:{id:string;draftRevision:number};event?:{id:string;requestHash:string};reused?:boolean};
      console.info(JSON.stringify({event:result.reused?'duplicate_request_reused':'workspace_write',directionId:result.direction?.id,eventId:result.event?.id,requestKeyHash:result.event?.requestHash.slice(0,12),currentRevision:result.direction?.draftRevision,phase:method,duration:Math.round(performance.now()-start)}));
    }
    const created=method==='CREATE'&&!(value as {reused?:boolean}).reused;
    return NextResponse.json(value,{status:created?201:200,headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const status=error instanceof WorkspaceNotFound?404:error instanceof WorkspaceConflict?409:error instanceof WorkspaceServiceError?error.status:error instanceof SyntaxError||error instanceof RangeError?400:503;
    const code=error instanceof WorkspaceConflict?error.code:error instanceof WorkspaceServiceError?error.code:status===404?'NOT_FOUND':status===400?'INVALID_INPUT':'SERVICE_UNAVAILABLE';
    if(status===503)console.error(JSON.stringify({event:'workspace_error',phase:method,errorCode:code,duration:Math.round(performance.now()-start)}));
    return NextResponse.json({code,retryable:status===503,preservedContext:true,...(error instanceof WorkspaceConflict||error instanceof WorkspaceServiceError?{currentRevision:error.currentRevision}:{})},{status});
  }
}
export async function workspaceJson(request:Request):Promise<unknown> {
  const text=await request.text();if(text.length>65536)throw new WorkspaceServiceError('REQUEST_TOO_LARGE');return JSON.parse(text);
}
