import type { GenerationParams, PromptControlSnapshot, QuickGenerationAuthorizationSnapshot } from '@/types/models';

export interface DraftPatch {
  target: 'variable' | 'invariant' | 'constraint' | 'intent' | 'detail' | 'customPrompt' | 'negativePrompt' | 'model' | 'aspectRatio' | 'quality';
  key: string;
  action: 'set' | 'strengthen' | 'relax' | 'disable' | 'replace';
  before: string | null;
  after: string | null;
}
export interface ContextReference { kind: 'asset' | 'iteration' | 'evidence' | 'event'; id: string; analysisTaskId: string | null }
export interface WorkspaceDraft {
  control: PromptControlSnapshot | null;
  params: GenerationParams;
  customPrompt: string | null;
  negativePromptText: string;
  constraints: string[];
  aspectRatioSource: 'reference' | 'user' | 'restore' | 'fallback';
}
export interface WorkspaceDirection {
  id: string; userId: string; title: string; creationRequestKey: string; draftRevision: number;
  analysisTaskId: string | null; sourceAssetId: string | null; sourceTemplateId: string | null;
  sourceIterationId: string | null; preferredIterationId: string | null; draft: WorkspaceDraft;
  quickAuthorizationId: string | null; quickState: 'none' | 'armed' | 'consumed'; quickSettingsHash: string | null;
  quickSnapshot: QuickGenerationAuthorizationSnapshot | null; quickActivationId: string | null;
  authorizationEpoch: number; createdAt: string; updatedAt: string;
}
export type AgentResponseKind = 'answer' | 'clarify' | 'proposal' | 'render_request' | 'unsupported';
export interface WorkspaceEvent {
  id: string; directionId: string; userId: string; sequence: number; requestKey: string; requestHash: string;
  kind: 'turn' | 'restored' | 'draft_change' | 'generation' | 'memory' | 'authorization';
  state: 'processing' | 'completed' | 'failed'; baseRevision: number | null; resultingRevision: number | null;
  inputText: string | null; replyText: string | null; responseKind: AgentResponseKind | null;
  references: ContextReference[]; changes: DraftPatch[]; inverseChanges: DraftPatch[]; choices: string[];
  proposalState: 'none' | 'pending' | 'applied' | 'discarded' | 'stale';
  generationTaskId: string | null; memoryId: string | null; relatedEventId: string | null;
  deadlineAt: string | null; reservedCostUsd: string; errorCode: string | null; createdAt: string; updatedAt: string;
}
export interface AgentReply { kind: AgentResponseKind; text: string; changes: DraftPatch[]; evidenceIds: string[]; choices: string[] }
export type GenerationDispatchState = 'prepared' | 'submitting' | 'submitted' | 'unknown' | 'outputStored' | 'terminal';
export interface GenerationDispatchFields {
  directionId: string | null; requestKey: string | null; requestHash: string | null; draftRevision: number | null;
  dispatchState: GenerationDispatchState | null; attemptedAt: string | null; deadlineAt: string | null;
  lastReconciledAt: string | null; retryOf: string | null; outputUrl: string | null; outputObjectKey: string | null;
  outputMimeType: string | null; outputWidth: number | null; outputHeight: number | null;
  reservedResultAssetId: string | null; reservedCostUsd: string | null;
}
