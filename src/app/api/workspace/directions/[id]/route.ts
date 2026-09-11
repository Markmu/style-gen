import { workspaceHttp, workspaceJson } from '@/lib/workspace/http';
import { getWorkspaceDirection, patchWorkspaceDirection } from '@/lib/workspace/service';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context){return workspaceHttp(async userId=>getWorkspaceDirection(userId,(await context.params).id));}
export async function PATCH(request:Request,context:Context){return workspaceHttp(async userId=>patchWorkspaceDirection(userId,(await context.params).id,await workspaceJson(request)),'PATCH');}
