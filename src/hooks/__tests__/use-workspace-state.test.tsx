// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import {
  useWorkspaceState,
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_STORAGE_VERSION,
} from "@/hooks/use-workspace-state";
import type { VisualRecipe, VisualRecipeV2Success } from "@/types/models";

const mockRecipe: VisualRecipe = {
  imageSummary: "A serene landscape",
  subject: "Mountain range",
  scene: "Alpine meadow",
  composition: "Rule of thirds",
  cameraLanguage: "Wide angle",
  lighting: "Golden hour",
  color: "Warm palette",
  texture: "Soft",
  styleTags: ["landscape", "nature"],
  mood: "Peaceful",
  visualKeywords: ["mountain", "meadow"],
  mustKeep: ["golden light"],
  replaceable: ["specific flowers"],
};

const v2Recipe: VisualRecipeV2Success = {
  schemaVersion: 2,
  extractionStatus: "partial",
  extractionReasons: ["Partial but usable"],
  contentDescription: { summary: "A chair", subject: "chair", subjectAttributes: [], supportingElements: [] },
  styleProfile: {
    visualMedium: [],
    composition: [{ id: "composition_1", value: "centered", evidence: ["Centered in frame"], confidence: 0.9 }],
    camera: [], color: [], lighting: [], formLanguage: [], materialTexture: [], atmosphere: [], rendering: [],
  },
  styleInvariants: [{ id: "composition_invariant_1", kind: "hard", dimension: "composition", value: "centered", evidence: ["Centered in frame"], confidence: 0.9, sourceObservationIds: ["composition_1"] }],
  contentVariables: [{ name: "subject", label: "Subject", defaultValue: "chair", sourceField: "subject" }],
  optionalModifiers: [],
  negativeConstraints: [],
  styleFingerprint: { tokens: ["centered"], scores: { realism: null, abstraction: null, contrast: null, saturation: null, softness: null, detailDensity: null, symmetry: null, depth: null, atmosphericIntensity: null } },
  promptOutputs: {
    reconstructionPrompt: "Content: A chair; Composition: centered",
    conciseTemplate: "Content: {{subject}}; Composition: centered",
    standardTemplate: "Content: {{subject}}; Composition: centered",
    professionalTemplate: "Content: {{subject}}; Composition: centered",
  },
};

describe("useWorkspaceState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  // 1. 初始状态为 idle - P0
  it("初始状态为 idle", () => {
    const { result } = renderHook(() => useWorkspaceState());

    expect(result.current.state).toBe("idle");
    expect(result.current.referenceImageUrl).toBeNull();
    expect(result.current.assetId).toBeNull();
    expect(result.current.analysisTaskId).toBeNull();
    expect(result.current.recipe).toBeNull();
    expect(result.current.promptText).toBe("");
    expect(result.current.negativePromptText).toBe("");
    expect(result.current.generationTaskId).toBeNull();
    expect(result.current.resultImageUrl).toBeNull();
    expect(result.current.mimeType).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.degradation).toEqual({
      analysisQueueing: false,
      generationQueueing: false,
      generationUnavailable: false,
      analysisUnavailable: false,
    });
  });

  // 2. idle → uploading - P0
  it("idle → uploading", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.startUpload("image/png");
    });

    expect(result.current.state).toBe("uploading");
    expect(result.current.mimeType).toBe("image/png");
  });

  // 3. uploading → analyzing - P0
  it("uploading → analyzing (via completeUpload)", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.startUpload("image/png");
    });
    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });

    expect(result.current.state).toBe("analyzing");
    expect(result.current.assetId).toBe("asset-123");
    expect(result.current.referenceImageUrl).toBe("https://example.com/img.png");
  });

  // 4. analyzing → analysis_ready - P0
  it("analyzing → analysis_ready", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.startUpload();
    });
    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.startAnalysis("task-1");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "generated prompt", "negative prompt");
    });

    expect(result.current.state).toBe("analysis_ready");
    expect(result.current.recipe).toEqual(mockRecipe);
    expect(result.current.promptText).toBe("generated prompt");
    expect(result.current.negativePromptText).toBe("negative prompt");
  });

  it("completeAnalysis 写入自动模板字段", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeAnalysis(mockRecipe, "rendered prompt", "", {
        analysisTemplateContent: "Create {{subject}}.",
        analysisTemplateVariables: [
          { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
        ],
        analysisTemplateStatus: "ready",
        analysisTemplateReason: null,
      });
    });

    expect(result.current.analysisTemplateContent).toBe("Create {{subject}}.");
    expect(result.current.analysisTemplateVariables).toEqual([
      { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
    ]);
    expect(result.current.analysisTemplateStatus).toBe("ready");
    expect(result.current.analysisTemplateReason).toBeNull();
  });

  it("新会话分析Done后持久化自动模板字段", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "rendered prompt", "", {
        analysisTemplateContent: "Create {{subject}}.",
        analysisTemplateVariables: [
          { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
        ],
        analysisTemplateStatus: "ready",
        analysisTemplateReason: null,
      });
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const persisted = JSON.parse(
      sessionStorage.getItem("style-gen-workspace-state") ?? "{}",
    );
    expect(persisted.analysisTemplateContent).toBe("Create {{subject}}.");
    expect(persisted.analysisTemplateVariables).toEqual([
      { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
    ]);
    expect(persisted.analysisTemplateStatus).toBe("ready");
  });

  it("持久化并恢复 analysisTaskId 以支持刷新后生成", () => {
    const { result, unmount } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.startAnalysis("analysis-task-123");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "rendered prompt", "");
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const persisted = JSON.parse(
      sessionStorage.getItem("style-gen-workspace-state") ?? "{}",
    );
    expect(persisted.analysisTaskId).toBe("analysis-task-123");

    unmount();
    const restored = renderHook(() => useWorkspaceState());

    expect(restored.result.current.state).toBe("analysis_ready");
    expect(restored.result.current.analysisTaskId).toBe("analysis-task-123");
  });

  it("persists V2 output mode, anchors, variables, and custom draft and clears them on reset", () => {
    const { result, unmount } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-v2", "https://example.com/v2.png");
      result.current.startAnalysis("analysis-v2");
      result.current.completeAnalysis(v2Recipe, "Content: chair", "");
    });
    expect(result.current.v2PromptState).toMatchObject({
      outputMode: "standard",
      enabledInvariantIds: ["composition_invariant_1"],
      variableValues: { subject: "chair" },
    });

    act(() => {
      result.current.setV2PromptState((current) => ({
        ...current,
        outputMode: "custom",
        variableValues: { subject: "stool" },
        enabledInvariantIds: [],
        customPrompt: "hand tuned prompt",
      }));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    unmount();

    const restored = renderHook(() => useWorkspaceState());
    expect(restored.result.current.v2PromptState).toMatchObject({
      outputMode: "custom",
      variableValues: { subject: "stool" },
      enabledInvariantIds: [],
      customPrompt: "hand tuned prompt",
    });

    act(() => restored.result.current.reset());
    expect(restored.result.current.v2PromptState).toBeNull();
    expect(sessionStorage.getItem("style-gen-workspace-state")).toBeNull();
  });

  it("fallback analysis 清空模板正文和Variables但保留 prompt", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeAnalysis(mockRecipe, "fallback prompt", "", {
        analysisTemplateContent: null,
        analysisTemplateVariables: [],
        analysisTemplateStatus: "fallback",
        analysisTemplateReason: "No stable variables",
      });
    });

    expect(result.current.promptText).toBe("fallback prompt");
    expect(result.current.analysisTemplateContent).toBeNull();
    expect(result.current.analysisTemplateVariables).toEqual([]);
    expect(result.current.analysisTemplateStatus).toBe("fallback");
    expect(result.current.analysisTemplateReason).toBe("No stable variables");
  });

  it("ready analysis with empty variables falls back to text prompt", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeAnalysis(mockRecipe, "rendered prompt", "", {
        analysisTemplateContent: "Create {{subject}}.",
        analysisTemplateVariables: [],
        analysisTemplateStatus: "ready",
        analysisTemplateReason: null,
      });
    });

    expect(result.current.promptText).toBe("rendered prompt");
    expect(result.current.analysisTemplateContent).toBeNull();
    expect(result.current.analysisTemplateVariables).toEqual([]);
    expect(result.current.analysisTemplateStatus).toBe("fallback");
    expect(result.current.analysisTemplateReason).toBe("No stable replaceable variables were detected");
  });

  it("partial analysis with empty variables falls back to text prompt", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeAnalysis(mockRecipe, "partial prompt", "", {
        analysisTemplateContent: "Create {{subject}}.",
        analysisTemplateVariables: [],
        analysisTemplateStatus: "partial",
        analysisTemplateReason: "No trusted variables",
      });
    });

    expect(result.current.promptText).toBe("partial prompt");
    expect(result.current.analysisTemplateContent).toBeNull();
    expect(result.current.analysisTemplateVariables).toEqual([]);
    expect(result.current.analysisTemplateStatus).toBe("fallback");
    expect(result.current.analysisTemplateReason).toBe("No trusted variables");
  });

  // 5. failAnalysis 回退到 idle - P0
  it("failAnalysis 回退到 idle", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.startUpload();
    });
    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.startAnalysis("task-1");
    });
    act(() => {
      result.current.failAnalysis("Analysis Failed");
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.error).toEqual({
      message: "Analysis Failed",
      stage: undefined,
      code: undefined,
      retryable: undefined,
    });
  });

  // 6. failAnalysis 不清空已有数据 - P0
  it("failAnalysis 不清空已有数据 (assetId, referenceImageUrl preserved)", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.startUpload();
    });
    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.startAnalysis("task-1");
    });
    act(() => {
      result.current.failAnalysis("Analysis Failed");
    });

    expect(result.current.assetId).toBe("asset-123");
    expect(result.current.referenceImageUrl).toBe("https://example.com/img.png");
  });

  // 7. analysis_ready → generating - P0
  it("analysis_ready → generating", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.startGeneration("gen-task-1");
    });

    expect(result.current.state).toBe("generating");
    expect(result.current.generationTaskId).toBe("gen-task-1");
    expect(result.current.resultImageUrl).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // 8. setPromptText 更新 - P0
  it("setPromptText 更新", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setPromptText("new prompt");
    });

    expect(result.current.promptText).toBe("new prompt");
  });

  // 9. setNegativePromptText 更新 - P1
  it("setNegativePromptText 更新", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setNegativePromptText("no blurry");
    });

    expect(result.current.negativePromptText).toBe("no blurry");
  });

  // 10. reset 回到初始状态 - P0
  it("reset 回到初始状态", () => {
    const { result } = renderHook(() => useWorkspaceState());

    // Advance state
    act(() => {
      result.current.startUpload("image/png");
    });
    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.setError("some error");
    });

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.assetId).toBeNull();
    expect(result.current.referenceImageUrl).toBeNull();
    expect(result.current.recipe).toBeNull();
    expect(result.current.promptText).toBe("");
    expect(result.current.negativePromptText).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.mimeType).toBeNull();
  });

  // 11. clearError 只清错误 - P1
  it("clearError 只清错误", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.setError("some error", "vision");
    });

    expect(result.current.error).toEqual({ message: "some error", stage: "vision" });

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
    // Other state preserved
    expect(result.current.assetId).toBe("asset-123");
    expect(result.current.referenceImageUrl).toBe("https://example.com/img.png");
  });

  // 12. failAnalysis 带 SERVICE_UNAVAILABLE 码 → L4 - P1
  it("failAnalysis 带 SERVICE_UNAVAILABLE 码 → analysisUnavailable = true", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.startUpload();
    });
    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.startAnalysis("task-1");
    });
    act(() => {
      result.current.failAnalysis("服务不可用", "vision", "SERVICE_UNAVAILABLE", false);
    });

    expect(result.current.degradation.analysisUnavailable).toBe(true);
  });

  // 13. setAnalysisQueueing 设置 - P1
  it("setAnalysisQueueing 设置", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setAnalysisQueueing(true);
    });

    expect(result.current.degradation.analysisQueueing).toBe(true);

    act(() => {
      result.current.setAnalysisQueueing(false);
    });

    expect(result.current.degradation.analysisQueueing).toBe(false);
  });

  // 14. 完整上传→分析流转 - P0
  it("完整上传→分析流转", () => {
    const { result } = renderHook(() => useWorkspaceState());

    // idle → uploading
    act(() => {
      result.current.startUpload("image/jpeg");
    });
    expect(result.current.state).toBe("uploading");

    // uploading → analyzing
    act(() => {
      result.current.completeUpload("asset-1", "https://cdn.example.com/ref.jpg");
    });
    expect(result.current.state).toBe("analyzing");
    expect(result.current.assetId).toBe("asset-1");

    // startAnalysis with taskId
    act(() => {
      result.current.startAnalysis("analysis-task-1");
    });
    expect(result.current.state).toBe("analyzing");
    expect(result.current.analysisTaskId).toBe("analysis-task-1");

    // analyzing → analysis_ready
    act(() => {
      result.current.completeAnalysis(mockRecipe, "final prompt", "final neg");
    });
    expect(result.current.state).toBe("analysis_ready");
    expect(result.current.recipe).toEqual(mockRecipe);
    expect(result.current.promptText).toBe("final prompt");
    expect(result.current.negativePromptText).toBe("final neg");
  });

  // 15. generating → generation_ready - P0
  it("generating → generation_ready", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.startGeneration("gen-task-1");
    });
    act(() => {
      result.current.completeGeneration("https://cdn.example.com/result.png");
    });

    expect(result.current.state).toBe("generation_ready");
    expect(result.current.resultImageUrl).toBe("https://cdn.example.com/result.png");
    expect(result.current.error).toBeNull();
  });

  // 16. failGeneration 保留分析结果 - P0
  it("failGeneration 保留分析结果", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.startGeneration("gen-task-1");
    });
    act(() => {
      result.current.failGeneration("Generation Failed");
    });

    expect(result.current.state).toBe("generation_ready");
    expect(result.current.recipe).toEqual(mockRecipe);
    expect(result.current.promptText).toBe("prompt");
    expect(result.current.negativePromptText).toBe("neg");
    expect(result.current.error).toEqual({
      message: "Generation Failed",
      stage: "generation",
      code: undefined,
      retryable: undefined,
    });
  });

  // 17. generation_ready → generating（迭代）- P0
  it("generation_ready → generating（迭代）", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.startGeneration("gen-task-1");
    });
    act(() => {
      result.current.completeGeneration("https://cdn.example.com/result.png");
    });

    expect(result.current.state).toBe("generation_ready");

    // Start another generation (iteration)
    act(() => {
      result.current.startGeneration("gen-task-2");
    });

    expect(result.current.state).toBe("generating");
    expect(result.current.generationTaskId).toBe("gen-task-2");
    expect(result.current.resultImageUrl).toBeNull();
  });

  // 18. 迭代不重跑分析 - P0
  it("迭代不重跑分析", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.startGeneration("gen-task-1");
    });
    act(() => {
      result.current.completeGeneration("https://cdn.example.com/result.png");
    });

    // Iterate: start new generation without re-analysis
    act(() => {
      result.current.setPromptText("updated prompt");
    });
    act(() => {
      result.current.startGeneration("gen-task-2");
    });

    // Recipe is still preserved from the original analysis
    expect(result.current.recipe).toEqual(mockRecipe);
    expect(result.current.promptText).toBe("updated prompt");
    expect(result.current.state).toBe("generating");
  });

  // 19. failGeneration 带 SERVICE_UNAVAILABLE → L2 - P1
  it("failGeneration 带 SERVICE_UNAVAILABLE → generationUnavailable = true", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.startGeneration("gen-task-1");
    });
    act(() => {
      result.current.failGeneration("服务不可用", "SERVICE_UNAVAILABLE", false);
    });

    expect(result.current.degradation.generationUnavailable).toBe(true);
  });

  // 20. failGeneration 清除 generationQueueing - P0
  it("failGeneration 清除 generationQueueing", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setGenerationQueueing(true);
    });
    expect(result.current.degradation.generationQueueing).toBe(true);

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.startGeneration("gen-task-1");
    });
    act(() => {
      result.current.failGeneration("Generation Failed");
    });

    expect(result.current.degradation.generationQueueing).toBe(false);
  });

  // 21. failAnalysis 清除 analysisQueueing - P0
  it("failAnalysis 清除 analysisQueueing", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setAnalysisQueueing(true);
    });
    expect(result.current.degradation.analysisQueueing).toBe(true);

    act(() => {
      result.current.startUpload();
    });
    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.startAnalysis("task-1");
    });
    act(() => {
      result.current.failAnalysis("Analysis Failed");
    });

    expect(result.current.degradation.analysisQueueing).toBe(false);
  });

  // 22. reset 清除所有降级状态 - P0
  it("reset 清除所有降级状态", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setAnalysisQueueing(true);
    });
    act(() => {
      result.current.setGenerationQueueing(true);
    });
    act(() => {
      result.current.setGenerationUnavailable(true);
    });
    act(() => {
      result.current.setAnalysisUnavailable(true);
    });

    expect(result.current.degradation).toEqual({
      analysisQueueing: true,
      generationQueueing: true,
      generationUnavailable: true,
      analysisUnavailable: true,
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.degradation).toEqual({
      analysisQueueing: false,
      generationQueueing: false,
      generationUnavailable: false,
      analysisUnavailable: false,
    });
  });

  // 23. failAnalysis 存储 error code 和 retryable - P0
  it("failAnalysis 存储 error code 和 retryable", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.startUpload();
    });
    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.startAnalysis("task-1");
    });
    act(() => {
      result.current.failAnalysis("出错了", "vision", "RATE_LIMITED", true);
    });

    expect(result.current.error).toEqual({
      message: "出错了",
      stage: "vision",
      code: "RATE_LIMITED",
      retryable: true,
    });
  });

  // 24. failGeneration 存储 error code 和 retryable - P0
  it("failGeneration 存储 error code 和 retryable", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-123", "https://example.com/img.png");
    });
    act(() => {
      result.current.completeAnalysis(mockRecipe, "prompt", "neg");
    });
    act(() => {
      result.current.startGeneration("gen-task-1");
    });
    act(() => {
      result.current.failGeneration("生成限流", "RATE_LIMITED", true);
    });

    expect(result.current.error).toEqual({
      message: "生成限流",
      stage: "generation",
      code: "RATE_LIMITED",
      retryable: true,
    });
  });

  it("历史恢复写入并持久化对应的 source asset 和 image", () => {
    const { result, unmount } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.enterHistoryRestored(
        "https://cdn.example.com/generated/result.webp",
        mockRecipe,
        "restored prompt",
        "restored negative prompt",
        "restored-analysis-task",
        {
          sourceAssetId: "restored-source-asset",
          sourceImageUrl:
            "https://cdn.example.com/references/restored-source-asset/original.png",
        },
      );
    });

    expect(result.current.state).toBe("history_restored");
    expect(result.current.assetId).toBe("restored-source-asset");
    expect(result.current.referenceImageUrl).toBe(
      "https://cdn.example.com/references/restored-source-asset/original.png",
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    unmount();

    const restored = renderHook(() => useWorkspaceState());
    expect(restored.result.current.assetId).toBe("restored-source-asset");
    expect(restored.result.current.referenceImageUrl).toBe(
      "https://cdn.example.com/references/restored-source-asset/original.png",
    );
  });

  it("旧历史缺少 source image 时不会把生成结果图用作参考图", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload(
        "current-source-asset",
        "https://cdn.example.com/references/current-source/original.png",
      );
    });
    act(() => {
      result.current.enterHistoryRestored(
        "https://cdn.example.com/generated/history-result.webp",
        mockRecipe,
        "restored prompt",
        "",
        "legacy-analysis-task",
      );
    });

    expect(result.current.referenceImageUrl).toBe(
      "https://cdn.example.com/references/current-source/original.png",
    );
    expect(result.current.referenceImageUrl).not.toBe(result.current.resultImageUrl);
  });

  // ─── plan-07: Style Memory 身份与来源参考图（复用预检/身份条数据源） ───

  it("初始 memoryIdentity 为 null（非 Memory 路径不受影响）", () => {
    const { result } = renderHook(() => useWorkspaceState());
    expect(result.current.memoryIdentity).toBeNull();
  });

  it("setMemoryIdentity 写入并持久化；置 null 即移除", () => {
    const { result, unmount } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setSourceReference("memory-source-asset", "https://cdn.example.com/references/memory/original.png");
    });
    act(() => {
      result.current.setMemoryIdentity({
        id: "style-memory-a",
        name: "Editorial Soft Daylight",
        verificationStatus: "user_verified",
        retainedRuleCount: 3,
      });
    });

    expect(result.current.memoryIdentity).toEqual({
      id: "style-memory-a",
      name: "Editorial Soft Daylight",
      verificationStatus: "user_verified",
      retainedRuleCount: 3,
    });

    // 防抖窗口后落盘，重挂载可恢复（?templateId= 直入后刷新仍显示身份条）
    act(() => {
      vi.advanceTimersByTime(300);
    });
    unmount();

    const restored = renderHook(() => useWorkspaceState());
    expect(restored.result.current.memoryIdentity).toMatchObject({
      id: "style-memory-a",
      retainedRuleCount: 3,
    });
  });

  it("恢复态移除身份：setMemoryIdentity(null) 同步清空且落盘为 null", () => {
    const { result, unmount } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setSourceReference("memory-source-asset", "https://cdn.example.com/references/memory/original.png");
    });
    act(() => {
      result.current.setMemoryIdentity({
        id: "style-memory-b",
        name: "Night Neon",
        verificationStatus: "pending_verification",
        retainedRuleCount: 1,
      });
    });
    act(() => {
      result.current.setMemoryIdentity(null);
    });

    expect(result.current.memoryIdentity).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    unmount();

    const restored = renderHook(() => useWorkspaceState());
    expect(restored.result.current.memoryIdentity).toBeNull();
    expect(restored.result.current.assetId).toBe("memory-source-asset");
  });

  it("快照中的损坏 memoryIdentity 恢复时按缺失处理（v4 超集兼容）", () => {
    sessionStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: WORKSPACE_STORAGE_VERSION,
        assetId: "legacy-asset",
        referenceImageUrl: "https://cdn.example.com/references/legacy/original.png",
        promptText: "kept prompt",
        memoryIdentity: { id: 42 },
      }),
    );

    const { result } = renderHook(() => useWorkspaceState());
    expect(result.current.memoryIdentity).toBeNull();
    expect(result.current.promptText).toBe("kept prompt");
  });

  // ─── plan-02: Workspace v5 创作节奏、快速授权闩锁与迁移 ─────────────────────

  const quickSnapshot = {
    schemaVersion: 1 as const,
    intent: "reconstruction" as const,
    detailLevel: "standard" as const,
    aspectRatioPolicy: "reference_or_fallback" as const,
    generationSettings: { quality: "standard", model: "flux-2-dev" },
  };

  function readPersisted() {
    return JSON.parse(
      sessionStorage.getItem("style-gen-workspace-state") ?? "{}",
    );
  }

  it("初始状态默认 analyze_edit / none / 无快照，detail 默认 standard", () => {
    const { result } = renderHook(() => useWorkspaceState());

    expect(result.current.creationPace).toBe("analyze_edit");
    expect(result.current.quickAuthorization).toBe("none");
    expect(result.current.quickGenerationAuthorizationSnapshot).toBeNull();
    expect(result.current.quickAuthorizationClearedReason).toBeNull();
    expect(result.current.promptControls).toEqual({
      intent: "same_style",
      detailLevel: "standard",
    });
    expect(result.current.generationParams).toEqual({
      aspectRatio: "1:1",
      quality: "standard",
      model: "flux-2-dev",
    });
    expect(result.current.aspectRatioSource).toBe("fallback");
    expect(result.current.preferredIterationId).toBeNull();
  });

  it("v4 快照迁移：保留参考/Prompt/变量，授权归 none，detail 默认 standard", () => {
    sessionStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        assetId: "v4-asset",
        referenceImageUrl: "https://cdn.example.com/references/v4/original.png",
        analysisTaskId: "v4-analysis",
        recipe: v2Recipe,
        promptText: "kept v4 prompt",
        negativePromptText: "",
        analysisTemplateContent: "Content: {{subject}}",
        analysisTemplateVariables: v2Recipe.contentVariables,
        analysisTemplateStatus: "ready",
        analysisTemplateReason: null,
        generationTaskId: null,
        v2PromptState: {
          outputMode: "standard",
          enabledInvariantIds: ["composition_invariant_1"],
          variableValues: { subject: "chair" },
          enabledModifierNames: [],
          modifierValues: {},
          customPrompt: "",
        },
      }),
    );

    const { result } = renderHook(() => useWorkspaceState());

    expect(result.current.assetId).toBe("v4-asset");
    expect(result.current.promptText).toBe("kept v4 prompt");
    expect(result.current.recipe).toEqual(v2Recipe);
    expect(result.current.analysisTemplateContent).toBe("Content: {{subject}}");
    // 迁移不推测授权：无合法快速快照时强制 none
    expect(result.current.creationPace).toBe("analyze_edit");
    expect(result.current.quickAuthorization).toBe("none");
    expect(result.current.quickGenerationAuthorizationSnapshot).toBeNull();
    expect(result.current.promptControls).toEqual({
      intent: "same_style",
      detailLevel: "standard",
    });
  });

  it("v4 快照含可识别旧 outputMode 时映射 detail/intent 字段", () => {
    sessionStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        assetId: "v4-asset-2",
        referenceImageUrl: "https://cdn.example.com/references/v4-2/original.png",
        promptText: "kept",
        v2PromptState: {
          outputMode: "professional",
          enabledInvariantIds: [],
          variableValues: {},
          enabledModifierNames: [],
          modifierValues: {},
          customPrompt: "",
        },
      }),
    );

    const professional = renderHook(() => useWorkspaceState());
    expect(professional.result.current.promptControls).toEqual({
      intent: "same_style",
      detailLevel: "professional",
    });
    professional.unmount();
    sessionStorage.clear();

    sessionStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        assetId: "v4-asset-3",
        referenceImageUrl: "https://cdn.example.com/references/v4-3/original.png",
        promptText: "kept",
        v2PromptState: {
          outputMode: "reconstruction",
          enabledInvariantIds: [],
          variableValues: {},
          enabledModifierNames: [],
          modifierValues: {},
          customPrompt: "",
        },
      }),
    );

    const reconstruction = renderHook(() => useWorkspaceState());
    expect(reconstruction.result.current.promptControls).toEqual({
      intent: "reconstruction",
      detailLevel: "standard",
    });
  });

  it("confirmQuickRecreate 原子持久化 armed + 快照（同步 flush，不经防抖窗口）", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });

    expect(result.current.creationPace).toBe("quick_recreate");
    expect(result.current.quickAuthorization).toBe("armed");
    expect(result.current.quickGenerationAuthorizationSnapshot).toEqual(
      quickSnapshot,
    );
    expect(result.current.quickAuthorizationClearedReason).toBeNull();

    // 同步落盘：未推进 300ms 防抖计时器即可读到 armed（请求前先持久化的前提）
    const persisted = readPersisted();
    expect(persisted.version).toBe(WORKSPACE_STORAGE_VERSION);
    expect(persisted.creationPace).toBe("quick_recreate");
    expect(persisted.quickAuthorization).toBe("armed");
    expect(persisted.quickGenerationAuthorizationSnapshot).toEqual(quickSnapshot);
  });

  it("consumeQuickAuthorization 将 armed 置为 consumed 并同步落盘，快照保留用于解释", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    act(() => {
      result.current.consumeQuickAuthorization();
    });

    expect(result.current.quickAuthorization).toBe("consumed");
    expect(result.current.quickGenerationAuthorizationSnapshot).toEqual(
      quickSnapshot,
    );
    expect(readPersisted().quickAuthorization).toBe("consumed");
  });

  it("clearQuickAuthorization 清快照、置 none 并记录原因（阻塞路径）", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    act(() => {
      result.current.clearQuickAuthorization("blocked by readiness");
    });

    expect(result.current.quickAuthorization).toBe("none");
    expect(result.current.quickGenerationAuthorizationSnapshot).toBeNull();
    expect(result.current.quickAuthorizationClearedReason).toBe(
      "blocked by readiness",
    );
    const persisted = readPersisted();
    expect(persisted.quickAuthorization).toBe("none");
    expect(persisted.quickGenerationAuthorizationSnapshot).toBeNull();
  });

  it("exitQuickRecreate 回 analyze_edit、清授权并说明原因", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    act(() => {
      result.current.exitQuickRecreate();
    });

    expect(result.current.creationPace).toBe("analyze_edit");
    expect(result.current.quickAuthorization).toBe("none");
    expect(result.current.quickGenerationAuthorizationSnapshot).toBeNull();
    expect(result.current.quickAuthorizationClearedReason).toContain(
      "exited quick recreate",
    );
  });

  it("failAnalysis 清除 armed 快照并说明原因；参考上下文保留", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-q", "https://cdn.example.com/r/original.png");
    });
    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    act(() => {
      result.current.failAnalysis("Vision analysis failed", "vision");
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.assetId).toBe("asset-q");
    expect(result.current.referenceImageUrl).toBe(
      "https://cdn.example.com/r/original.png",
    );
    expect(result.current.quickAuthorization).toBe("none");
    expect(result.current.quickGenerationAuthorizationSnapshot).toBeNull();
    expect(result.current.quickAuthorizationClearedReason).toContain(
      "analysis failed",
    );
  });

  it("armed 快照损坏/缺字段时恢复视为 none、清快照并提示重新确认", () => {
    sessionStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: WORKSPACE_STORAGE_VERSION,
        assetId: "armed-asset",
        referenceImageUrl: "https://cdn.example.com/references/armed/original.png",
        promptText: "kept prompt",
        creationPace: "quick_recreate",
        quickAuthorization: "armed",
        quickGenerationAuthorizationSnapshot: { schemaVersion: 1, intent: "same_style" },
      }),
    );

    const { result } = renderHook(() => useWorkspaceState());

    expect(result.current.quickAuthorization).toBe("none");
    expect(result.current.quickGenerationAuthorizationSnapshot).toBeNull();
    expect(result.current.quickAuthorizationClearedReason).toContain("invalid");
    // 其余工作区内容照常恢复
    expect(result.current.promptText).toBe("kept prompt");
  });

  it("consumed 持久化后重挂载恢复为 consumed——刷新不复活 armed 也不丢提交事实", () => {
    const { result, unmount } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-c", "https://cdn.example.com/r/c/original.png");
    });
    act(() => {
      result.current.startAnalysis("analysis-c");
    });
    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    act(() => {
      result.current.consumeQuickAuthorization();
    });
    unmount();

    const restored = renderHook(() => useWorkspaceState());
    expect(restored.result.current.quickAuthorization).toBe("consumed");
    expect(restored.result.current.quickGenerationAuthorizationSnapshot).toEqual(
      quickSnapshot,
    );
  });

  it("空工作区确认后的 armed 刷新可成对恢复（ADR-2 闩锁独立于参考内容）", () => {
    const { result, unmount } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    unmount();

    const restored = renderHook(() => useWorkspaceState());
    expect(restored.result.current.state).toBe("idle");
    expect(restored.result.current.assetId).toBeNull();
    expect(restored.result.current.creationPace).toBe("quick_recreate");
    expect(restored.result.current.quickAuthorization).toBe("armed");
    expect(restored.result.current.quickGenerationAuthorizationSnapshot).toEqual(
      quickSnapshot,
    );
  });

  it("completeUpload 在 consumed 后重置授权（更换方向归 none），armed 保留待兑现", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-a", "https://cdn.example.com/r/a/original.png");
    });
    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    act(() => {
      result.current.consumeQuickAuthorization();
    });
    // 新参考图 = 新方向：consumed 不带入，需重新确认
    act(() => {
      result.current.completeUpload("asset-b", "https://cdn.example.com/r/b/original.png");
    });
    expect(result.current.quickAuthorization).toBe("none");
    expect(result.current.quickGenerationAuthorizationSnapshot).toBeNull();

    // armed 期间上传正是快速路径主流程：授权保留
    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    act(() => {
      result.current.completeUpload("asset-c2", "https://cdn.example.com/r/c2/original.png");
    });
    expect(result.current.quickAuthorization).toBe("armed");
    expect(result.current.quickGenerationAuthorizationSnapshot).toEqual(
      quickSnapshot,
    );
  });

  it("setGenerationParams 更新参数并按需标记来源；setPreferredIterationId 记录会话偏好", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.setGenerationParams(
        { aspectRatio: "16:9", quality: "hd", model: "nano-banana-2-lite" },
        "user",
      );
    });
    expect(result.current.generationParams).toEqual({
      aspectRatio: "16:9",
      quality: "hd",
      model: "nano-banana-2-lite",
    });
    expect(result.current.aspectRatioSource).toBe("user");

    // 未提供来源时不覆盖既有 user 标记（质量/模型变更不动画幅来源）
    act(() => {
      result.current.setGenerationParams({
        aspectRatio: "16:9",
        quality: "standard",
        model: "nano-banana-2-lite",
      });
    });
    expect(result.current.aspectRatioSource).toBe("user");

    act(() => {
      result.current.setPreferredIterationId("iteration-9");
    });
    expect(result.current.preferredIterationId).toBe("iteration-9");
  });

  it("分析成功事件重复触发（轮询重复 success）不改变授权闩锁", () => {
    const { result } = renderHook(() => useWorkspaceState());

    act(() => {
      result.current.completeUpload("asset-d", "https://cdn.example.com/r/d/original.png");
    });
    act(() => {
      result.current.startAnalysis("analysis-d");
    });
    act(() => {
      result.current.confirmQuickRecreate(quickSnapshot);
    });
    act(() => {
      result.current.completeAnalysis(v2Recipe, "compiled prompt", "neg");
    });
    act(() => {
      result.current.consumeQuickAuthorization();
    });
    // 轮询重复回放同一 completed 响应
    act(() => {
      result.current.completeAnalysis(v2Recipe, "compiled prompt", "neg");
    });

    expect(result.current.state).toBe("analysis_ready");
    expect(result.current.quickAuthorization).toBe("consumed");
    expect(result.current.quickGenerationAuthorizationSnapshot).toEqual(
      quickSnapshot,
    );
  });
});
