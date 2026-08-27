export type RenderNextAction =
  | "upload_reference"
  | "wait_for_analysis"
  | "resolve_variables"
  | "wait_for_task"
  | "retry_service"
  | "generate";

/** plan-07：就绪结论随附的 Memory 上下文（ADR-7 单一来源的消费侧输入） */
export interface MemoryReadinessContext {
  id: string;
  retainedRuleCount: number;
  /** 仍缺失的必填变量展示名清单（label 优先，回退 name） */
  missingVariableNames: string[];
}

export interface RenderReadiness {
  promptResolved: boolean;
  variablesResolved: boolean;
  styleSignalsAvailable: boolean;
  serviceAvailable: boolean;
  workspaceIdle: boolean;
  canGenerate: boolean;
  disabledReason: string;
  nextAction: RenderNextAction;
  /** plan-07：Memory 复用激活时缺失的必填变量名；无 memory 或无缺失为空数组 */
  missingVariableNames: string[];
  /** plan-07：工作台当前是否处于某条 Style Memory 的复用上下文中 */
  memoryActive: boolean;
}

export interface RenderReadinessInput {
  promptText: string | null | undefined;
  variables?: readonly unknown[] | null;
  hasUnresolvedVariables: boolean;
  facets?: readonly unknown[] | null;
  workspaceState:
    | "idle"
    | "uploading"
    | "analyzing"
    | "analysis_ready"
    | "generating"
    | "generation_ready"
    | "history_restored";
  degradation?: {
    generationUnavailable?: boolean;
  } | null;
  error?: {
    code?: string;
    stage?: string;
  } | null;
  analysisTaskId?: string | null;
  /**
   * plan-07：当前应用的 Style Memory 上下文；非 Memory 路径传 null / 缺省，
   * 全部既有字段与判定优先级不变。
   */
  memory?: MemoryReadinessContext | null;
  /**
   * plan-07：生成上下文桥接槽位——Memory 握手/直入路径从来源 Iteration
   * （GET /api/generation/{id} 的 analysisTaskId，或切换前快照就地保留的
   * 分析上下文）恢复出的生成上下文。它与轮询通道解耦：
   * `useAnalysis` 只订阅 ws.analysisTaskId，避免对陈旧 id 发起无意义轮询；
   * 本字段仅参与“是否存在生成上下文”的门控判定。
   */
  generationContextReady?: boolean;
}

const BUSY_WORKSPACE_STATES = new Set([
  "uploading",
  "analyzing",
  "generating",
]);

export function deriveRenderReadiness(
  input: RenderReadinessInput,
): RenderReadiness {
  const promptResolved = Boolean(input.promptText?.trim());
  const memory = input.memory ?? null;
  // plan-07：Memory 复用上下文中，必填变量缺失清单本身参与门控
  // （PRD 规则 22 / ADR-7：单一来源结论），与 prompt 占位符判定取交集；
  // 无 memory 时该分支不生效，既有行为完全一致。
  const hasMissingMemoryVariables =
    !!memory && memory.missingVariableNames.length > 0;
  const variablesResolved =
    !input.hasUnresolvedVariables && !hasMissingMemoryVariables;
  const styleSignalsAvailable = (input.facets?.length ?? 0) > 0;
  const serviceAvailable =
    !input.degradation?.generationUnavailable &&
    input.error?.code !== "SERVICE_UNAVAILABLE";
  const workspaceIdle = !BUSY_WORKSPACE_STATES.has(input.workspaceState);
  // plan-07：轮询任务 id 与桥接上下文任一存在即视为具备生成上下文。
  // 未启用 Memory 复用（generationContextReady 缺省 false）时与既有行为完全一致。
  const hasGenerationContext =
    Boolean(input.analysisTaskId) || Boolean(input.generationContextReady);

  const baseResult = {
    promptResolved,
    variablesResolved,
    styleSignalsAvailable,
    serviceAvailable,
    workspaceIdle,
    missingVariableNames:
      variablesResolved || !memory ? [] : memory.missingVariableNames,
    memoryActive: Boolean(memory),
  };

  const canGenerate =
    promptResolved &&
    variablesResolved &&
    serviceAvailable &&
    workspaceIdle &&
    hasGenerationContext;

  if (canGenerate) {
    return {
      ...baseResult,
      canGenerate,
      disabledReason: "Ready to render with the current prompt.",
      nextAction: "generate",
    };
  }

  if (!promptResolved) {
    return {
      ...baseResult,
      canGenerate,
      disabledReason: "Upload a reference or edit the prompt before generating.",
      nextAction: "upload_reference",
    };
  }

  if (!variablesResolved) {
    return {
      ...baseResult,
      canGenerate,
      disabledReason: "Resolve template variables before generating.",
      nextAction: "resolve_variables",
    };
  }

  if (!hasGenerationContext) {
    return {
      ...baseResult,
      canGenerate,
      disabledReason: "Wait for analysis to finish before generating.",
      nextAction: "wait_for_analysis",
    };
  }

  if (!workspaceIdle) {
    return {
      ...baseResult,
      canGenerate,
      disabledReason: "Wait for the current workspace task to finish.",
      nextAction: "wait_for_task",
    };
  }

  if (!serviceAvailable) {
    return {
      ...baseResult,
      canGenerate,
      disabledReason:
        "Generation service is temporarily unavailable. Retry service when ready.",
      nextAction: "retry_service",
    };
  }

  return {
    ...baseResult,
    canGenerate,
    disabledReason: "Wait for the workspace to become ready.",
    nextAction: "wait_for_task",
  };
}

export function getRenderNextActionLabel(action: RenderNextAction): string {
  switch (action) {
    case "upload_reference":
      return "Upload a reference or edit prompt";
    case "wait_for_analysis":
      return "Wait for analysis";
    case "resolve_variables":
      return "Resolve variables";
    case "wait_for_task":
      return "Wait for current task";
    case "retry_service":
      return "Retry service";
    case "generate":
      return "Generate image";
  }
}
