// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultComparisonPanel } from "@/components/workspace/result-comparison-panel";
import { composePromptDocument } from "@/lib/prompt-composer";
import type {
  IterationDetail,
  PromptControlSnapshot,
  VisualRecipeV2Success,
} from "@/types/models";

function buildRecipe(
  overrides: Partial<VisualRecipeV2Success> = {},
): VisualRecipeV2Success {
  return {
    schemaVersion: 2,
    extractionStatus: "ready",
    extractionReasons: [],
    contentDescription: {
      summary: "An amber bottle on folded linen",
      subject: "amber bottle",
      subjectAttributes: ["glass", "folded linen"],
      supportingElements: ["quiet studio table"],
    },
    styleProfile: {
      visualMedium: [],
      composition: [
        {
          id: "composition_1",
          value: "asymmetric thirds composition",
          evidence: [],
          confidence: 0.88,
        },
      ],
      camera: [],
      color: [
        {
          id: "color_1",
          value: "warm amber and sand palette",
          evidence: [],
          confidence: 0.92,
        },
      ],
      lighting: [
        {
          id: "lighting_1",
          value: "soft directional window light",
          evidence: [],
          confidence: 0.94,
        },
      ],
      formLanguage: [],
      materialTexture: [],
      atmosphere: [],
      rendering: [],
    },
    styleInvariants: [
      {
        id: "color_invariant_1",
        value: "warm amber and sand palette",
        evidence: [],
        confidence: 0.92,
        kind: "hard",
        dimension: "color",
        sourceObservationIds: ["color_1"],
      },
      {
        id: "lighting_invariant_1",
        value: "soft directional window light",
        evidence: [],
        confidence: 0.94,
        kind: "hard",
        dimension: "lighting",
        sourceObservationIds: ["lighting_1"],
      },
    ],
    contentVariables: [
      { name: "subject", label: "Subject", defaultValue: "amber bottle", sourceField: "subject" },
      {
        name: "environment",
        label: "Environment",
        defaultValue: "quiet studio table",
        sourceField: "environment",
      },
    ],
    optionalModifiers: [],
    negativeConstraints: [],
    styleFingerprint: { tokens: [], scores: {} as never },
    promptOutputs: {
      reconstructionPrompt: "",
      conciseTemplate: "",
      standardTemplate: "",
      professionalTemplate: "",
    },
    ...overrides,
  };
}

function buildDetail(
  overrides: Partial<IterationDetail> = {},
): IterationDetail {
  return {
    id: "dir-compare-1",
    analysisTaskId: "analysis-task-1",
    status: "completed",
    promptSnapshot:
      "Content: ceramic vase, quiet studio table; Color: warm amber and sand palette",
    negativePromptSnapshot: "",
    params: { aspectRatio: "1:1", quality: "standard" },
    modelName: "flux.2",
    resultFileUrl: "https://cdn.example.com/results/dir-compare-1/result.webp",
    errorMessage: null,
    recipe: null,
    recipeSource: "missing",
    variables: [],
    variablesSource: "missing",
    sourceImageUrl:
      "https://cdn.example.com/references/mock-asset-id/original.png",
    sourceAssetId: "mock-asset-id",
    sourceTemplateId: null,
    sourceTemplateName: null,
    savedTemplate: null,
    analysisTemplateVariables: [],
    promptControlSnapshot: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildControlsSnapshot(
  overrides: Partial<PromptControlSnapshot> = {},
): PromptControlSnapshot {
  return {
    schemaVersion: 1,
    trigger: "manual",
    intent: "same_style",
    detailLevel: "standard",
    editorMode: "variables",
    customPromptDirty: false,
    enabledInvariantIds: ["color_invariant_1", "lighting_invariant_1"],
    variableValues: { subject: "amber bottle", environment: "quiet studio table" },
    enabledModifierNames: [],
    modifierValues: {},
    adjustments: [],
    ...overrides,
  };
}

function mountPanel(
  options: {
    recipe?: VisualRecipeV2Success | null;
    detail?: IterationDetail | null;
    detailStatus?: "idle" | "loading" | "ready" | "error";
    detailErrorMessage?: string | null;
  } = {},
) {
  const recipe = "recipe" in options ? options.recipe : buildRecipe();
  const detail = "detail" in options ? options.detail : buildDetail();
  const detailStatus = options.detailStatus ?? "ready";
  const compiledPrompt =
    recipe && detailStatus === "ready"
      ? composePromptDocument(recipe, buildControlsSnapshot())
      : null;

  const handlers = {
    onRetryDetail: vi.fn(),
    onOpenIteration: vi.fn(),
    onApplyAdjustment: vi.fn(),
    onCancel: vi.fn(),
    onSelectOtherDimension: vi.fn(),
  };
  render(
    <ResultComparisonPanel
      iterationId={detail?.id ?? "dir-compare-1"}
      detail={detailStatus === "ready" ? detail : null}
      detailStatus={detailStatus}
      detailErrorMessage={options.detailErrorMessage ?? null}
      recipe={recipe}
      compiledPrompt={compiledPrompt}
      {...handlers}
    />,
  );
  return handlers;
}

function dimensionButton(dimension: string) {
  return document.querySelector<HTMLElement>(
    `[data-testid="comparison-dimension-option"][data-dimension="${dimension}"]`,
  ) as HTMLElement;
}

describe("ResultComparisonPanel", () => {
  it("打开即聚焦标题（内联 focus-managed region，非模态）", () => {
    mountPanel();
    expect(screen.getByTestId("comparison-panel-title")).toHaveFocus();
    expect(screen.getByTestId("comparison-panel-title").tabIndex).toBe(-1);
  });

  it("展示真实双图、历史 Prompt 快照与「正在调整当前草稿」边界", () => {
    mountPanel();

    expect(screen.getByTestId("comparison-reference-image")).toHaveAttribute(
      "src",
      "https://cdn.example.com/references/mock-asset-id/original.png",
    );
    expect(screen.getByTestId("comparison-result-image")).toHaveAttribute(
      "src",
      "https://cdn.example.com/results/dir-compare-1/result.webp",
    );
    expect(screen.getByTestId("comparison-historical-prompt")).toHaveTextContent(
      "ceramic vase",
    );
    expect(screen.getByTestId("comparison-historical-context")).toBeVisible();
    expect(
      screen.getByTestId("comparison-historical-context"),
    ).toHaveTextContent("正在调整当前草稿");
    // polite live region：状态通知不夺焦点
    expect(screen.getByTestId("comparison-live-region")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("详情失败：真实错误位 + 重试 + 打开 Iteration 动作", async () => {
    const user = userEvent.setup();
    const handlers = mountPanel({
      detailStatus: "error",
      detailErrorMessage: "Direction feed temporarily unavailable",
    });

    const errorBlock = screen.getByTestId("comparison-detail-error");
    expect(errorBlock).toBeVisible();

    await user.click(screen.getByTestId("comparison-detail-retry"));
    expect(handlers.onRetryDetail).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("comparison-detail-open-iteration"));
    expect(handlers.onOpenIteration).toHaveBeenCalledWith("dir-compare-1");
  });

  it("多 invariant 维度：全部真实规则/观察/表达呈现，未选规则前四动作 disabled", async () => {
    const user = userEvent.setup();
    const recipe = buildRecipe({
      styleProfile: {
        ...buildRecipe().styleProfile,
        color: [
          {
            id: "color_1",
            value: "warm amber and sand palette",
            evidence: [],
            confidence: 0.92,
          },
          {
            id: "color_2",
            value: "muted sand undertones",
            evidence: [],
            confidence: 0.78,
          },
        ],
      },
      styleInvariants: [
        ...buildRecipe().styleInvariants,
        {
          id: "color_invariant_2",
          value: "muted sand undertones",
          evidence: [],
          confidence: 0.78,
          kind: "soft",
          dimension: "color",
          sourceObservationIds: ["color_2"],
        },
      ],
    });
    mountPanel({ recipe });

    await user.click(dimensionButton("color"));

    expect(screen.getAllByTestId("comparison-invariant-option")).toHaveLength(2);
    expect(
      screen.getAllByTestId("comparison-invariant-option").every((node) => {
        return node.getAttribute("aria-pressed") === "false";
      }),
    ).toBe(true);

    expect(
      screen
        .getAllByTestId("comparison-observation-item")
        .some((node) => node.textContent?.includes("warm amber and sand palette")),
    ).toBe(true);
    expect(screen.getByTestId("comparison-prompt-segments")).toHaveTextContent(
      "warm amber and sand palette",
    );

    for (const action of ["strengthen", "relax", "replace", "disable"]) {
      expect(screen.getByTestId(`adjustment-action-${action}`)).toBeDisabled();
    }

    // 选择真实规则后四动作开放
    await user.click(
      document.querySelector<HTMLElement>(
        '[data-testid="comparison-invariant-option"][data-invariant-id="color_invariant_2"]',
      ) as HTMLElement,
    );
    for (const action of ["strengthen", "relax", "replace", "disable"]) {
      expect(screen.getByTestId(`adjustment-action-${action}`)).toBeEnabled();
    }
  });

  it("单 invariant 维度：唯一规则可见地预选，四动作直接可用", async () => {
    const user = userEvent.setup();
    mountPanel();

    await user.click(dimensionButton("lighting"));

    const options = screen.getAllByTestId("comparison-invariant-option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAttribute(
      "data-invariant-id",
      "lighting_invariant_1",
    );
    expect(options[0]).toHaveAttribute("aria-pressed", "true");
    for (const action of ["strengthen", "relax", "replace", "disable"]) {
      expect(screen.getByTestId(`adjustment-action-${action}`)).toBeEnabled();
    }
  });

  it("零 invariant 维度：提示暂无可调整规则，仅保留其他/全文编辑", async () => {
    const user = userEvent.setup();
    mountPanel();

    await user.click(dimensionButton("composition"));

    expect(screen.getByTestId("comparison-invariant-empty")).toHaveTextContent(
      "暂无可调整规则",
    );
    expect(screen.queryByTestId("comparison-invariant-option")).toBeNull();
    // 真实 observation 仍展示
    expect(
      screen
        .getAllByTestId("comparison-observation-item")
        .some((node) => node.textContent?.includes("asymmetric thirds composition")),
    ).toBe(true);
    for (const action of ["strengthen", "relax", "replace", "disable"]) {
      expect(screen.getByTestId(`adjustment-action-${action}`)).toBeDisabled();
    }
    expect(screen.getByTestId("comparison-dimension-other")).toBeEnabled();
  });

  it("应用调整：按所选 invariantId 回调（strengthen 无替换值）", async () => {
    const user = userEvent.setup();
    const handlers = mountPanel();

    await user.click(dimensionButton("color"));
    await user.click(screen.getByTestId("adjustment-action-strengthen"));
    await user.click(screen.getByTestId("comparison-adjustment-apply"));

    expect(handlers.onApplyAdjustment).toHaveBeenCalledWith({
      invariantId: "color_invariant_1",
      action: "strengthen",
    });
    // 应用不提交生成、不取消——关闭/焦点编排由页面完成
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("replace 必须提供 trim 后非空的替换值才可应用", async () => {
    const user = userEvent.setup();
    const handlers = mountPanel();

    await user.click(dimensionButton("color"));
    await user.click(screen.getByTestId("adjustment-action-replace"));
    const input = screen.getByTestId("adjustment-replacement-input");
    expect(screen.getByTestId("comparison-adjustment-apply")).toBeDisabled();

    await user.type(input, "   ");
    expect(screen.getByTestId("comparison-adjustment-apply")).toBeDisabled();

    await user.clear(input);
    await user.type(input, "cool blue tones");
    await user.click(screen.getByTestId("comparison-adjustment-apply"));
    expect(handlers.onApplyAdjustment).toHaveBeenCalledWith({
      invariantId: "color_invariant_1",
      action: "replace",
      replacementValue: "cool blue tones",
    });
  });

  it("取消零写入：只触发 onCancel，不产生 adjustment 回调", async () => {
    const user = userEvent.setup();
    const handlers = mountPanel();

    await user.click(dimensionButton("lighting"));
    await user.click(screen.getByTestId("adjustment-action-relax"));
    await user.click(screen.getByTestId("comparison-adjustment-cancel"));

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onApplyAdjustment).not.toHaveBeenCalled();
  });

  it("「其他」维度：不创建 adjustment，切换全文编辑回调", async () => {
    const user = userEvent.setup();
    const handlers = mountPanel();

    await user.click(screen.getByTestId("comparison-dimension-other"));

    expect(handlers.onSelectOtherDimension).toHaveBeenCalledTimes(1);
    expect(handlers.onApplyAdjustment).not.toHaveBeenCalled();
  });

  it("历史快照与当前草稿区分：面板只展示历史文本，不改写编译输入", () => {
    mountPanel();
    // 历史文本来自 detail.promptSnapshot（ceramic vase）；
    // 当前草稿的编译文本（amber bottle）由页面持有，面板不回写
    expect(screen.getByTestId("comparison-historical-prompt")).toHaveTextContent(
      "ceramic vase",
    );
    expect(screen.getByTestId("comparison-historical-prompt")).not.toHaveTextContent(
      "amber bottle",
    );
  });

  it("比较对象切换时清空瞬时维度/规则选择", async () => {
    const user = userEvent.setup();
    const recipe = buildRecipe();
    const detail = buildDetail();
    const compiled = composePromptDocument(recipe, buildControlsSnapshot());
    const props = {
      detail,
      detailStatus: "ready" as const,
      detailErrorMessage: null,
      recipe,
      compiledPrompt: compiled,
      onRetryDetail: vi.fn(),
      onOpenIteration: vi.fn(),
      onApplyAdjustment: vi.fn(),
      onCancel: vi.fn(),
      onSelectOtherDimension: vi.fn(),
    };
    const { rerender } = render(
      <ResultComparisonPanel {...props} iterationId={detail.id} />,
    );

    await user.click(dimensionButton("lighting"));
    expect(
      screen.getAllByTestId("comparison-invariant-option")[0],
    ).toHaveAttribute("aria-pressed", "true");

    rerender(
      <ResultComparisonPanel
        {...props}
        iterationId="dir-compare-2"
        detail={{ ...detail, id: "dir-compare-2" }}
      />,
    );
    expect(screen.queryByTestId("comparison-invariant-option")).toBeNull();
  });
});
