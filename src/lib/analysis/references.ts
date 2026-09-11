import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { assets } from '@/lib/db/schema';
import { findEventByRequestKey, WorkspaceNotFound, type WorkspaceTransaction } from '@/lib/repositories/workspace-repository';

/** The analysis creation receipt preserves the ordered source set through retries and callbacks. */
export async function analysisReferences(task: {userId: string | null; requestKey: string | null; sourceAssetId: string}, reader: typeof db | WorkspaceTransaction = db) {
  if (!task.userId) throw new WorkspaceNotFound();
  const receipt = task.requestKey ? await findEventByRequestKey(task.userId, `analysis:${task.requestKey}`, reader) : null;
  const metadata = receipt?.inputText ? JSON.parse(receipt.inputText) : null;
  const ids: string[] = metadata?.referenceAssetIds ?? [task.sourceAssetId];
  const rows = await reader.select().from(assets).where(and(inArray(assets.id, ids), eq(assets.userId, task.userId)));
  return ids.map(id => {
    const asset = rows.find(row => row.id === id);
    if (!asset) throw new WorkspaceNotFound();
    return asset;
  });
}
