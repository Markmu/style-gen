import { workspaceHttp } from '@/lib/workspace/http';
import { reconcileAnalysis } from '@/lib/analysis/submission';
import { identifier } from '@/lib/workspace/validation';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  return workspaceHttp(async userId=>reconcileAnalysis(userId,identifier((await params).id)));
}
