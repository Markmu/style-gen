// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { useWorkspaceState } from "@/hooks/use-workspace-state";
import type { VisualRecipe } from "@/types/models";

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

  it("新会话分析完成后持久化自动模板字段", () => {
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

  it("fallback analysis 清空模板正文和变量但保留 prompt", () => {
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
    expect(result.current.analysisTemplateReason).toBe("未识别到足够稳定的可替换变量");
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
      result.current.failAnalysis("分析失败");
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.error).toEqual({
      message: "分析失败",
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
      result.current.failAnalysis("分析失败");
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
      result.current.failGeneration("生成失败");
    });

    expect(result.current.state).toBe("generation_ready");
    expect(result.current.recipe).toEqual(mockRecipe);
    expect(result.current.promptText).toBe("prompt");
    expect(result.current.negativePromptText).toBe("neg");
    expect(result.current.error).toEqual({
      message: "生成失败",
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
      result.current.failGeneration("生成失败");
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
      result.current.failAnalysis("分析失败");
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
});
