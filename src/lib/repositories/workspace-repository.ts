import { createHash } from 'node:crypto';
import { and, count, desc, eq, lte, max, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, workspaceDirections, workspaceEvents } from '@/lib/db/schema';
import { generateId } from '@/lib/ulid';
import type { WorkspaceDraft } from '@/lib/workspace/contracts';

export type WorkspaceTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DirectionRow = typeof workspaceDirections.$inferSelect;
export type EventRow = typeof workspaceEvents.$inferSelect;
export type NewEvent = Omit<typeof workspaceEvents.$inferInsert, 'id' | 'userId' | 'directionId' | 'sequence'>;
export class WorkspaceConflict extends Error {
  constructor(public code: 'revision_conflict' | 'request_key_conflict', public currentRevision?: number) { super(code); }
}
export class WorkspaceNotFound extends Error { constructor() { super('workspace_not_found'); } }

/** Callers provide the operation's explicit whitelist; transient credentials never enter its hash. */
export function hashWorkspaceRequest(input: Record<string, unknown>, allowedKeys: readonly string[]): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
    return value;
  };
  return createHash('sha256').update(JSON.stringify(normalize(Object.fromEntries(allowedKeys.filter(k => k !== 'summaryToken' && Object.hasOwn(input, k)).map(k => [k, input[k]]))))).digest('hex');
}
export async function findDirection(userId: string, directionId: string, tx: WorkspaceTransaction | typeof db = db) {
  const [row] = await tx.select().from(workspaceDirections).where(and(eq(workspaceDirections.userId, userId), eq(workspaceDirections.id, directionId)));
  return row ?? null;
}
export async function findEventByRequestKey(userId: string, requestKey: string, tx: WorkspaceTransaction | typeof db = db) {
  const [row] = await tx.select().from(workspaceEvents).where(and(eq(workspaceEvents.userId, userId), eq(workspaceEvents.requestKey, requestKey)));
  return row ?? null;
}
/** Fixed global-budget → user → direction ordering. Keep external I/O outside callback. */
export async function withWorkspaceTransaction<T>(userId: string, directionId: string | null, action: (tx: WorkspaceTransaction, direction: DirectionRow | null) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(166001)`);
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    if (!user) throw new WorkspaceNotFound();
    let direction: DirectionRow | null = null;
    if (directionId) {
      const [row] = await tx.select().from(workspaceDirections).where(and(eq(workspaceDirections.id, directionId), eq(workspaceDirections.userId, userId))).for('update');
      if (!row) throw new WorkspaceNotFound();
      direction = row;
    }
    return action(tx, direction);
  });
}
export async function createDirection(userId: string, input: Pick<typeof workspaceDirections.$inferInsert, 'title' | 'creationRequestKey' | 'draft'> & Partial<Pick<DirectionRow, 'analysisTaskId' | 'sourceAssetId' | 'sourceTemplateId' | 'sourceIterationId'>>, originalRequestHash?: string, creationContext?: Pick<NewEvent, 'memoryId' | 'generationTaskId'>) {
  return withWorkspaceTransaction(userId, null, async tx => {
    const [existing] = await tx.select().from(workspaceDirections).where(and(eq(workspaceDirections.userId, userId), eq(workspaceDirections.creationRequestKey, input.creationRequestKey)));
    const requestHash = originalRequestHash ?? hashWorkspaceRequest(input, ['title', 'creationRequestKey', 'draft', 'analysisTaskId', 'sourceAssetId', 'sourceTemplateId', 'sourceIterationId']);
    if (existing) {
      const receipt = await findEventByRequestKey(userId, `creation:${input.creationRequestKey}`, tx);
      if (!receipt || receipt.requestHash !== requestHash) throw new WorkspaceConflict('request_key_conflict');
      return existing;
    }
    const [row] = await tx.insert(workspaceDirections).values({ ...input, id: generateId(), userId }).returning();
    await appendEvent(tx, userId, row.id, { requestKey: `creation:${input.creationRequestKey}`, requestHash, kind: 'restored', ...creationContext });
    return row;
  });
}
/** Requires withWorkspaceTransaction's direction lock; can join a task/Memory write atomically. */
export async function appendEvent(tx: WorkspaceTransaction, userId: string, directionId: string, input: NewEvent): Promise<EventRow> {
  const owner = await findDirection(userId, directionId, tx);
  if (!owner) throw new WorkspaceNotFound();
  // Also lock here so direct transaction composition cannot allocate duplicate sequence numbers.
  await tx.select({ id: workspaceDirections.id }).from(workspaceDirections).where(eq(workspaceDirections.id, directionId)).for('update');
  const existing = await findEventByRequestKey(userId, input.requestKey, tx);
  if (existing) {
    if (existing.requestHash !== input.requestHash || existing.directionId !== directionId) throw new WorkspaceConflict('request_key_conflict');
    return existing;
  }
  const [last] = await tx.select({ sequence: max(workspaceEvents.sequence) }).from(workspaceEvents).where(eq(workspaceEvents.directionId, directionId));
  const [event] = await tx.insert(workspaceEvents).values({ ...input, id: generateId(), userId, directionId, sequence: (last.sequence ?? 0) + 1 }).returning();
  return event;
}
export async function compareAndSwapDraft(userId: string, directionId: string, baseRevision: number, draft: WorkspaceDraft, event: NewEvent) {
  return withWorkspaceTransaction(userId, directionId, async (tx, direction) => {
    const previous = await findEventByRequestKey(userId, event.requestKey, tx);
    if (previous) {
      if (previous.requestHash !== event.requestHash || previous.directionId !== directionId) throw new WorkspaceConflict('request_key_conflict');
      return { direction: direction!, event: previous, reused: true };
    }
    if (direction!.draftRevision !== baseRevision) throw new WorkspaceConflict('revision_conflict', direction!.draftRevision);
    const [updated] = await tx.update(workspaceDirections).set({ draft, draftRevision: baseRevision + 1, updatedAt: new Date() }).where(and(eq(workspaceDirections.id, directionId), eq(workspaceDirections.draftRevision, baseRevision))).returning();
    if (!updated) throw new WorkspaceConflict('revision_conflict');
    const receipt = await appendEvent(tx, userId, directionId, { ...event, baseRevision, resultingRevision: baseRevision + 1 });
    return { direction: updated, event: receipt, reused: false };
  });
}
export async function listEvents(userId: string, directionId: string, options: { page?: number; pageSize?: number; throughSequence?: number } = {}) {
  if (!await findDirection(userId, directionId)) throw new WorkspaceNotFound();
  const page = options.page ?? 1, pageSize = options.pageSize ?? 20;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 || (options.throughSequence !== undefined && (!Number.isSafeInteger(options.throughSequence) || options.throughSequence < 0))) throw new RangeError('Invalid event pagination');
  const [last] = await db.select({ sequence: max(workspaceEvents.sequence) }).from(workspaceEvents).where(and(eq(workspaceEvents.userId, userId), eq(workspaceEvents.directionId, directionId)));
  const throughSequence = Math.min(options.throughSequence ?? last.sequence ?? 0, last.sequence ?? 0);
  const where = and(eq(workspaceEvents.userId, userId), eq(workspaceEvents.directionId, directionId), lte(workspaceEvents.sequence, throughSequence));
  const [items, totals] = await Promise.all([
    db.select().from(workspaceEvents).where(where).orderBy(desc(workspaceEvents.sequence)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(workspaceEvents).where(where),
  ]);
  return { items, total: totals[0].total, throughSequence, hasMore: page * pageSize < totals[0].total };
}
