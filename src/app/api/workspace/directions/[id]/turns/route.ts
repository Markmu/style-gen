import { workspaceHttp,workspaceJson } from '@/lib/workspace/http';
import { submitWorkspaceTurn } from '@/lib/workspace/turns';
import { NextResponse } from 'next/server';
export const runtime='nodejs';
export const maxDuration=240;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const response=await workspaceHttp(async userId=>submitWorkspaceTurn(userId,(await params).id,await workspaceJson(request)),'TURN');
 if(!response.ok)return response;
 const body=await response.json();
 const status=body.event?.state==='processing'?202:body.event?.state==='failed'?(body.event.errorCode==='AGENT_CONTEXT_TOO_LARGE'?400:body.event.errorCode==='MODEL_UNAVAILABLE'||body.event.errorCode==='MODEL_COST_UNAPPROVED'?503:502):200;
 return NextResponse.json({...body,...(status>=400?{code:body.event.errorCode,eventId:body.event.id,retryable:true,preservedContext:true}:{})},{status,headers:{'Cache-Control':'no-store'}});
}
