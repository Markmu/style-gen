import type { DraftPatch, ContextReference } from './contracts';

export interface ReferenceAttachment {
  file: Blob;
  name: string;
  uploaded?: NonNullable<LocalWorkspaceDraft["uploaded"]>;
}

export interface LocalWorkspaceDraft {
  referenceAttachments?: ReferenceAttachment[];
  viewState?: {selectedId:string|null;compareId:string|null;secondId:string|null;mode:"reference"|"result"|"compare"};
  preferenceIntent?: {directionId:string;requestKey:string;baseRevision:number;preferredIterationId:string|null};
  userId: string;
  directionId: string;
  text: string;
  attachment: Blob | null;
  attachmentName: string | null;
  pendingSave: { attempted?: boolean; requestKey: string; baseRevision: number; changes: DraftPatch[]; preferredIterationId?:string|null } | null;
  requestKeys: Record<string, string>;
  lastViewed: number;
  snapshot?: unknown;
  snapshotRevision?:number;
  analysisRetryOf?:string;
  newReferenceIntent?: {sourceAssetId:string;requestKey:string};
  uploaded?: { assetId: string; fileUrl: string; width: number; height: number; mimeType: string };
  references?:ContextReference[];
  commandReceipt?:string;
  commandIntent?:{requestKey:string;action:'apply'|'discard'|'undo';eventId:string;baseRevision:number;changes?:DraftPatch[]};
  turnIntent?: {requestKey:string;baseRevision:number;text:string;references:ContextReference[];summaryToken:string|null;retryOf?:string};
  generationIntent?: {directionId:string;requestKey:string;baseRevision:number;summaryToken:string|null;mode:"current"|"retryOriginal"|"quick";retryOf?:string;authorizationId?:string};
  transition?: {createdDirectionId?:string;requestKey:string;kind:'empty'|'analysis'|'iteration'|'template';id?:string};
  migration?: { directionId: string; patchKey: string; migrated: boolean };
  /** plan-10：Style Memory 保存意图（待提交键 + 表单快照本机持久，AC-18/AC-21） */
  memorySaveIntent?: MemorySaveIntent;
}

/** plan-10：保存向导表单快照（未确认结果的本机保留，不称已同步） */
export interface MemorySaveFormSnapshot {
  name: string;
  description: string;
  content: string;
  retainedRules: { text: string; kept: boolean }[];
  constraints: { text: string; kept: boolean }[];
  /** 完整变量形状（含 label/sourceField）：恢复后的提交体须与原指纹逐字节一致 */
  variables: { name: string; defaultValue: string; label?: string; sourceField?: string }[];
  isRepresentative: boolean;
}

/** plan-10：Memory 保存幂等意图状态（pending→unknown/failed→committed） */
export interface MemorySaveIntent {
  requestKey: string;
  /** 提交体指纹（不含 requestKey/directionId）：同指纹重试复用原键 */
  fingerprint: string;
  state: 'pending' | 'unknown' | 'failed' | 'committed';
  committedMemoryId?: string | null;
  /** 恢复期只读确认（回执命中）时置位，与正常保存成功区分 */
  recovered?: boolean;
  form?: MemorySaveFormSnapshot | null;
}
export interface DraftStorage {
  read(userId: string, directionId: string): Promise<LocalWorkspaceDraft | null>;
  write(draft: LocalWorkspaceDraft): Promise<void>;
  recent(userId: string): Promise<string | null>;
}
const key = (userId: string, directionId: string) => JSON.stringify([userId, directionId]);
/** The record and recent pointer commit together. A rejected transaction is never reported saved. */
export function createIndexedDraftStorage(factory: IDBFactory = indexedDB): DraftStorage {
  let connection: Promise<IDBDatabase> | null = null;
  const open = () => connection ??= new Promise((resolve, reject) => {
    const request = factory.open('style-gen-workspace-drafts', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts');
      request.result.createObjectStore('recent');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { connection = null; reject(new Error('Local storage is blocked')); };
  });
  const read = async <T>(store: string, id: string): Promise<T | null> => {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(store, 'readonly');
      const request = transaction.objectStore(store).get(id);
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Local storage is unavailable'));
    });
  };
  return {
    read: (userId, directionId) => read('drafts', key(userId, directionId)),
    recent: userId => read('recent', userId),
    async write(draft) {
      const database = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['drafts', 'recent'], 'readwrite');
        transaction.objectStore('drafts').put(draft, key(draft.userId, draft.directionId));
        transaction.objectStore('recent').put(draft.directionId, draft.userId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Local storage is unavailable'));
      });
    },
  };
}
/** Serial writes prevent an old debounce from overwriting a newer navigation flush. */
export function createDraftWriter(storage: DraftStorage, onError: (error: unknown) => void = () => {}, delay = 300, onSaved: () => void = () => {}) {
  let pending: LocalWorkspaceDraft | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flight = Promise.resolve();
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const draft = pending;
    pending = null;
    if (draft) flight = flight.catch(() => {}).then(() => storage.write(draft));
    try { await flight; onSaved(); } catch (error) { onError(error); throw error; }
  };
  return {
    schedule(draft: LocalWorkspaceDraft) {
      pending = structuredClone(draft);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void flush().catch(() => {}); }, delay);
    },
    flush,
    cancel() { if (timer) clearTimeout(timer); timer = null; pending = null; },
  };
}
export function draftAttachments(draft: LocalWorkspaceDraft): ReferenceAttachment[] {
  return draft.referenceAttachments ?? (draft.attachment ? [{file: draft.attachment, name: draft.attachmentName ?? 'reference.png', uploaded: draft.uploaded}] : []);
}

export function withAttachments(draft: LocalWorkspaceDraft, references: ReferenceAttachment[]): LocalWorkspaceDraft {
  return {...draft, referenceAttachments: references, attachment: references[0]?.file ?? null, attachmentName: references[0]?.name ?? null, uploaded: references[0]?.uploaded};
}

export function validateAttachments(files: readonly Blob[], limit = 1): string | null {
  if (!files.length || files.length > limit) return limit === 1
    ? 'Attach one reference image at a time. Your message is preserved.'
    : 'Attach up to 3 reference images. Remove an image before adding more. Your message is preserved.';
  if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) return 'Choose a JPG, PNG, or WebP image. Your message is preserved.';
  if (files.some(file => file.size > 10 * 1024 * 1024)) return 'Choose an image smaller than 10 MB. Your message is preserved.';
  return null;
}
