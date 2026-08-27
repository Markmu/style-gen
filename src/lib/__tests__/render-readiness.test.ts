import { describe, expect, it } from "vitest";
import { deriveRenderReadiness } from "@/lib/render-readiness";

const baseInput = {
  promptText: "A polished glass product scene",
  variables: [],
  hasUnresolvedVariables: false,
  facets: [{ id: "color" }, { id: "lighting" }],
  workspaceState: "analysis_ready" as const,
  degradation: { generationUnavailable: false },
  error: null,
  analysisTaskId: "analysis-01",
};

describe("deriveRenderReadiness", () => {
  it("allows generation when prompt, variables, service, workspace, and analysis context are ready", () => {
    expect(deriveRenderReadiness(baseInput)).toMatchObject({
      promptResolved: true,
      variablesResolved: true,
      styleSignalsAvailable: true,
      serviceAvailable: true,
      workspaceIdle: true,
      canGenerate: true,
      nextAction: "generate",
    });
  });

  it("blocks empty prompt and points to upload or editing", () => {
    expect(
      deriveRenderReadiness({ ...baseInput, promptText: "  " }),
    ).toMatchObject({
      promptResolved: false,
      canGenerate: false,
      nextAction: "upload_reference",
      disabledReason: "Upload a reference or edit the prompt before generating.",
    });
  });

  it("blocks unresolved variables with a variables-specific reason", () => {
    expect(
      deriveRenderReadiness({
        ...baseInput,
        promptText: "Create {{subject}} in soft light",
        hasUnresolvedVariables: true,
      }),
    ).toMatchObject({
      variablesResolved: false,
      canGenerate: false,
      nextAction: "resolve_variables",
      disabledReason: "Resolve template variables before generating.",
    });
  });

  it("blocks when analysis context is missing even if prompt text exists", () => {
    expect(
      deriveRenderReadiness({ ...baseInput, analysisTaskId: null }),
    ).toMatchObject({
      canGenerate: false,
      nextAction: "wait_for_analysis",
      disabledReason: "Wait for analysis to finish before generating.",
    });
  });

  it("keeps style signal availability visible without inventing a network dependency", () => {
    expect(deriveRenderReadiness({ ...baseInput, facets: [] })).toMatchObject({
      styleSignalsAvailable: false,
      canGenerate: true,
    });
  });

  it("blocks service unavailable states and offers retry service as the next action", () => {
    expect(
      deriveRenderReadiness({
        ...baseInput,
        degradation: { generationUnavailable: true },
      }),
    ).toMatchObject({
      serviceAvailable: false,
      canGenerate: false,
      nextAction: "retry_service",
    });
  });

  it("blocks while workspace tasks are busy", () => {
    expect(
      deriveRenderReadiness({
        ...baseInput,
        workspaceState: "generating",
      }),
    ).toMatchObject({
      workspaceIdle: false,
      canGenerate: false,
      nextAction: "wait_for_task",
    });
  });

  // ─── plan-07：Memory 复用上下文（向后兼容扩展） ───

  const memoryContext = {
    id: "style-memory-reuse-editorial",
    retainedRuleCount: 3,
    missingVariableNames: ["主体", "场景"],
  };

  it("defaults missingVariableNames/memoryActive so legacy callers stay untouched", () => {
    const result = deriveRenderReadiness(baseInput);
    expect(result.missingVariableNames).toEqual([]);
    expect(result.memoryActive).toBe(false);
    // 既有字段与判定优先级不变
    expect(result.canGenerate).toBe(true);
    expect(result.nextAction).toBe("generate");
  });

  it("reports memory as inactive when the input carries a null memory", () => {
    expect(
      deriveRenderReadiness({ ...baseInput, memory: null }).memoryActive,
    ).toBe(false);
  });

  it("blocks on missing required variables while listing the memory-derived names", () => {
    expect(
      deriveRenderReadiness({
        ...baseInput,
        analysisTaskId: null,
        memory: memoryContext,
        generationContextReady: true,
      }),
    ).toMatchObject({
      memoryActive: true,
      canGenerate: false,
      nextAction: "resolve_variables",
      disabledReason: "Resolve template variables before generating.",
      missingVariableNames: ["主体", "场景"],
    });
  });

  it("clears the missing-variable list once every memory variable is reported filled", () => {
    // 调用方（workspace 页面）按 trim(defaultValue)==='' 派生缺失清单并随 Memory
    // 上下文传入；全部填齐后清单清空，桥接上下文就绪即可生成。
    expect(
      deriveRenderReadiness({
        ...baseInput,
        analysisTaskId: null,
        memory: { ...memoryContext, missingVariableNames: [] },
        generationContextReady: true,
      }),
    ).toMatchObject({
      variablesResolved: true,
      missingVariableNames: [],
      canGenerate: true,
      memoryActive: true,
    });
  });

  it("treats the bridged generation context as sufficient for gating generation", () => {
    expect(
      deriveRenderReadiness({
        ...baseInput,
        analysisTaskId: null,
        memory: { ...memoryContext, missingVariableNames: [] },
        generationContextReady: true,
      }),
    ).toMatchObject({
      canGenerate: true,
      nextAction: "generate",
      memoryActive: true,
    });
  });

  it("keeps generation blocked when a memory is active but no generation context exists", () => {
    expect(
      deriveRenderReadiness({
        ...baseInput,
        analysisTaskId: null,
        memory: { ...memoryContext, missingVariableNames: [] },
      }),
    ).toMatchObject({
      canGenerate: false,
      nextAction: "wait_for_analysis",
      memoryActive: true,
    });
  });

  it("never reports missing variable names without an active memory", () => {
    expect(
      deriveRenderReadiness({
        ...baseInput,
        analysisTaskId: null,
        hasUnresolvedVariables: true,
        promptText: "Create {{subject}} in soft light",
      }).missingVariableNames,
    ).toEqual([]);
  });
});
