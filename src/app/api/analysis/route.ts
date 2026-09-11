import { workspaceHttp, workspaceJson } from '@/lib/workspace/http';
import { submitAnalysis } from '@/lib/analysis/submission';
export const maxDuration=240;
export async function POST(request: Request) {
  return workspaceHttp(async userId=>submitAnalysis(userId,await workspaceJson(request)), 'CREATE');
}
