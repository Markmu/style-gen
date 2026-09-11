import { workspaceHttp, workspaceJson } from '@/lib/workspace/http';
import { createWorkspaceDirection } from '@/lib/workspace/service';
export const runtime='nodejs';
export async function POST(request:Request) { return workspaceHttp(async userId=>createWorkspaceDirection(userId,await workspaceJson(request)),'CREATE'); }
