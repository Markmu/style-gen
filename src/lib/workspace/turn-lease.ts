import { and,eq,lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workspaceEvents } from '@/lib/db/schema';
import type { WorkspaceTransaction } from '@/lib/repositories/workspace-repository';
export async function expireAgentTurns(userId:string,directionId:string,reader:WorkspaceTransaction|typeof db=db,now=new Date()) {
 return reader.update(workspaceEvents).set({state:'failed',errorCode:'AGENT_TIMEOUT',updatedAt:now}).where(and(eq(workspaceEvents.userId,userId),eq(workspaceEvents.directionId,directionId),eq(workspaceEvents.kind,'turn'),eq(workspaceEvents.state,'processing'),lte(workspaceEvents.deadlineAt,now))).returning();
}
