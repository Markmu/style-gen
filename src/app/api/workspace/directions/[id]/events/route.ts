import { workspaceHttp } from '@/lib/workspace/http';
import { getWorkspaceEvents } from '@/lib/workspace/service';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return workspaceHttp(async userId=>getWorkspaceEvents(userId,(await context.params).id,new URL(request.url)));}
