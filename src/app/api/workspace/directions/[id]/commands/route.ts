import { workspaceHttp, workspaceJson } from '@/lib/workspace/http';
import { workspaceCommand } from '@/lib/workspace/service';
import { reconcileCommand } from '@/lib/generation/reconciliation';
export const maxDuration=240;
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return workspaceHttp(async userId=>{const body=await workspaceJson(request),id=(await context.params).id;return body&&typeof body==='object'&&'action' in body&&body.action==='reconcile'?reconcileCommand(userId,id,body):workspaceCommand(userId,id,body);},'COMMAND');}
