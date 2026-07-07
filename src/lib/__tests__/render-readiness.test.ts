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
});
