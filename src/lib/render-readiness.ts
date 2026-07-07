export type RenderNextAction =
  | "upload_reference"
  | "wait_for_analysis"
  | "resolve_variables"
  | "wait_for_task"
  | "retry_service"
  | "generate";

export interface RenderReadiness {
  promptResolved: boolean;
  variablesResolved: boolean;
  styleSignalsAvailable: boolean;
  serviceAvailable: boolean;
  workspaceIdle: boolean;
  canGenerate: boolean;
  disabledReason: string;
  nextAction: RenderNextAction;
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
  const variablesResolved = !input.hasUnresolvedVariables;
  const styleSignalsAvailable = (input.facets?.length ?? 0) > 0;
  const serviceAvailable =
    !input.degradation?.generationUnavailable &&
    input.error?.code !== "SERVICE_UNAVAILABLE";
  const workspaceIdle = !BUSY_WORKSPACE_STATES.has(input.workspaceState);
  const hasAnalysisContext = Boolean(input.analysisTaskId);

  const canGenerate =
    promptResolved &&
    variablesResolved &&
    serviceAvailable &&
    workspaceIdle &&
    hasAnalysisContext;

  if (canGenerate) {
    return {
      promptResolved,
      variablesResolved,
      styleSignalsAvailable,
      serviceAvailable,
      workspaceIdle,
      canGenerate,
      disabledReason: "Ready to render with the current prompt.",
      nextAction: "generate",
    };
  }

  if (!promptResolved) {
    return {
      promptResolved,
      variablesResolved,
      styleSignalsAvailable,
      serviceAvailable,
      workspaceIdle,
      canGenerate,
      disabledReason: "Upload a reference or edit the prompt before generating.",
      nextAction: "upload_reference",
    };
  }

  if (!variablesResolved) {
    return {
      promptResolved,
      variablesResolved,
      styleSignalsAvailable,
      serviceAvailable,
      workspaceIdle,
      canGenerate,
      disabledReason: "Resolve template variables before generating.",
      nextAction: "resolve_variables",
    };
  }

  if (!hasAnalysisContext) {
    return {
      promptResolved,
      variablesResolved,
      styleSignalsAvailable,
      serviceAvailable,
      workspaceIdle,
      canGenerate,
      disabledReason: "Wait for analysis to finish before generating.",
      nextAction: "wait_for_analysis",
    };
  }

  if (!workspaceIdle) {
    return {
      promptResolved,
      variablesResolved,
      styleSignalsAvailable,
      serviceAvailable,
      workspaceIdle,
      canGenerate,
      disabledReason: "Wait for the current workspace task to finish.",
      nextAction: "wait_for_task",
    };
  }

  if (!serviceAvailable) {
    return {
      promptResolved,
      variablesResolved,
      styleSignalsAvailable,
      serviceAvailable,
      workspaceIdle,
      canGenerate,
      disabledReason:
        "Generation service is temporarily unavailable. Retry service when ready.",
      nextAction: "retry_service",
    };
  }

  return {
    promptResolved,
    variablesResolved,
    styleSignalsAvailable,
    serviceAvailable,
    workspaceIdle,
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
