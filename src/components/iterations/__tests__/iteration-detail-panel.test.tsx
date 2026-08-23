// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  IterationDetailErrorFace,
  IterationDetailPanel,
} from "@/components/iterations/iteration-detail-panel";
import {
  STYLE_DIMENSIONS,
  type IterationDetail,
  type StoredVisualRecipe,
  type StyleDimension,
  type StyleObservation,
  type StyleFingerprintScoreKey,
} from "@/types/models";

// plan-04: 面板内置恢复动作经 use-iteration-restore 使用 useRouter 导航
const routerPushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

const WORKSPACE_STORAGE_KEY = "style-gen-workspace-state";

function emptyStyleProfile(): Record<StyleDimension, StyleObservation[]> {
  return Object.fromEntries(
    STYLE_DIMENSIONS.map((dimension) => [dimension, []]),
  ) as Record<StyleDimension, StyleObservation[]>;
}

/** 最小可用 V2 recipe：color/lighting 各一条观察 + 一条 color 不变量 */
const V2_RECIPE: StoredVisualRecipe = {
  schemaVersion: 2,
  extractionStatus: "ready",
  extractionReasons: [],
  contentDescription: {
    summary: "An amber bottle on a quiet studio table",
    subjectAttributes: [],
    supportingElements: [],
  },
  styleProfile: {
    ...emptyStyleProfile(),
    color: [
      {
        id: "color_1",
        value: "warm amber and sand palette",
        evidence: ["Amber and linen dominate the frame"],
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
  },
  styleInvariants: [
    {
      id: "color_invariant_1",
      kind: "hard",
      dimension: "color",
      value: "warm amber and sand palette",
      evidence: [],
      confidence: 0.92,
      sourceObservationIds: ["color_1"],
    },
  ],
  contentVariables: [],
  optionalModifiers: [],
  negativeConstraints: [],
  styleFingerprint: {
    tokens: [],
    scores: {} as Record<StyleFingerprintScoreKey, number | null>,
  },
  promptOutputs: {
    reconstructionPrompt: "",
    conciseTemplate: "",
    standardTemplate: "",
    professionalTemplate: "",
  },
};

const DETAIL_VARIABLES = [
  { name: "subject", label: "Subject", defaultValue: "amber bottle", sourceField: "subject" },
  {
    name: "environment",
    label: "Environment",
    defaultValue: "quiet studio table",
    sourceField: "environment" as const,
  },
];

function buildDetail(
  overrides: Partial<IterationDetail> = {},
): IterationDetail {
  const status = overrides.status ?? "completed";
  return {
    id: "iter-001",
    analysisTaskId: "analysis-001",
    status,
    promptSnapshot: "Precise neon cityscape at dusk with amber glass towers",
    negativePromptSnapshot: "watermark, distorted glass",
    params: { aspectRatio: "16:9", quality: "hd" },
    modelName: "black-forest-2.5",
    resultFileUrl:
      status === "completed"
        ? "https://cdn.example.com/generated/iter-001/result.webp"
        : null,
    errorMessage: status === "failed" ? "Provider timeout while rendering" : null,
    recipe: V2_RECIPE,
    recipeSource: "snapshot",
    variables: DETAIL_VARIABLES,
    variablesSource: "snapshot",
    sourceImageUrl: "https://cdn.example.com/references/iter-001/original.png",
    sourceAssetId: "asset-001",
    sourceTemplateId: null,
    sourceTemplateName: null,
    savedTemplate: null,
    analysisTemplateVariables: DETAIL_VARIABLES,
    createdAt: "2024-03-03T09:00:00.000Z",
    updatedAt: "2024-03-03T09:00:30.000Z",
    ...overrides,
  };
}

function renderPanel(
  overrides: Partial<IterationDetail> = {},
  props: Partial<Parameters<typeof IterationDetailPanel>[0]> = {},
) {
  const onBackToList = vi.fn();
  const onPrevious = vi.fn();
  const onNext = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <IterationDetailPanel
        detail={buildDetail(overrides)}
        onBackToList={onBackToList}
        onPrevious={onPrevious}
        onNext={onNext}
        hasPrevious
        hasNext
        {...props}
      />
    </QueryClientProvider>,
  );
  return { ...utils, onBackToList, onPrevious, onNext };
}

describe("IterationDetailPanel — completed variant", () => {
  it("shows the reference and the real result side by side with full context blocks", () => {
    renderPanel();

    const panel = screen.getByTestId("iteration-detail-panel");
    expect(panel).toHaveAttribute("data-status", "completed");
    expect(panel).toHaveAttribute("data-iteration-id", "iter-001");
    expect(screen.getByTestId("iteration-detail-title")).toHaveTextContent(
      "Precise neon cityscape at dusk with amber glass towers",
    );
    expect(
      screen.getByRole("group", { name: /iteration navigation/i }),
    ).toBeInTheDocument();

    expect(
      within(screen.getByTestId("iteration-reference-image")).getByRole("img"),
    ).toHaveAttribute(
      "src",
      "https://cdn.example.com/references/iter-001/original.png",
    );
    expect(
      within(screen.getByTestId("iteration-result-image")).getByRole("img"),
    ).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated/iter-001/result.webp",
    );

    const evidence = screen.getByTestId("iteration-context-evidence");
    expect(evidence).toHaveAttribute("data-source", "snapshot");
    expect(evidence).toHaveTextContent("Lighting");
    expect(evidence).toHaveTextContent("warm amber and sand palette");
    expect(evidence).toHaveTextContent("92%");

    expect(screen.getByTestId("iteration-context-prompt")).toHaveTextContent(
      "Precise neon cityscape at dusk with amber glass towers",
    );

    const variables = screen.getByTestId("iteration-context-variables");
    expect(variables).toHaveAttribute("data-source", "snapshot");
    expect(variables).toHaveTextContent("amber bottle");
    expect(variables).toHaveTextContent("watermark, distorted glass");

    const settings = screen.getByTestId("iteration-context-settings");
    expect(settings).toHaveTextContent("16:9");
    expect(settings).toHaveTextContent("hd");
    expect(settings).toHaveTextContent("black-forest-2.5");
  });

  it("fills the footer with the built-in Continue this direction action (plan-04)", () => {
    renderPanel();

    const actions = screen.getByTestId("iteration-detail-actions");
    expect(actions).toBeVisible();
    // plan-04 默认主动作：completed → 继续此方向（架构 §6.3 步骤 1）
    expect(
      within(actions).getByRole("button", { name: /continue this direction/i }),
    ).toBeInTheDocument();
  });

  it("direct restore from an empty workspace applies the payload and navigates without a confirm dialog", async () => {
    sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
    routerPushMock.mockClear();
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      within(screen.getByTestId("iteration-detail-actions")).getByRole("button", {
        name: /continue this direction/i,
      }),
    );

    // 三豁免之“current 为空”：不弹替换确认，写入通道后导航回工作台
    expect(screen.queryByTestId("replace-confirm-dialog")).not.toBeInTheDocument();
    expect(routerPushMock).toHaveBeenCalledWith("/workspace");
    const persisted = JSON.parse(
      sessionStorage.getItem(WORKSPACE_STORAGE_KEY) ?? "{}",
    );
    expect(persisted.promptText).toBe("Precise neon cityscape at dusk with amber glass towers");
    expect(persisted.negativePromptText).toBe("watermark, distorted glass");
    expect(persisted.currentIterationId).toBe("iter-001");
    expect(persisted.previousResultUrl).toBe(
      "https://cdn.example.com/generated/iter-001/result.webp",
    );
  });

  it("renders slotted primary and secondary actions inside the reserved footer", () => {
    renderPanel(undefined, {
      primaryActions: <button type="button">Continue this direction</button>,
      secondaryActions: <button type="button">Save as Style Memory</button>,
    });

    const actions = screen.getByTestId("iteration-detail-actions");
    expect(
      within(actions).getByRole("button", { name: /continue this direction/i }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("button", { name: /save as style memory/i }),
    ).toBeInTheDocument();
  });
});

describe("IterationDetailPanel — processing variant", () => {
  it("shows the stage and preserved context without any generate or resubmit entry", () => {
    renderPanel({ status: "processing", resultFileUrl: null, errorMessage: null });

    const panel = screen.getByTestId("iteration-detail-panel");
    expect(panel).toHaveAttribute("data-status", "processing");
    expect(panel).toHaveTextContent(/generation in progress|processing/i);
    expect(panel).toHaveTextContent(/safe to leave|leave this page/i);

    // 已保留上下文：参考图 + 提示 + 变量 + 设置
    expect(
      within(screen.getByTestId("iteration-reference-image")).getByRole("img"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("iteration-context-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("iteration-context-variables")).toBeInTheDocument();
    expect(screen.getByTestId("iteration-context-settings")).toBeInTheDocument();

    // 无结果图、无动作区、无生成/重复提交入口
    expect(screen.queryByTestId("iteration-result-image")).not.toBeInTheDocument();
    expect(screen.queryByTestId("iteration-detail-actions")).not.toBeInTheDocument();
    expect(
      Array.from(panel.querySelectorAll("button")).map((button) => button.textContent),
    ).toEqual(
      expect.not.arrayContaining([
        expect.stringMatching(/generate|regenerate|resubmit|submit again|re-?run/i),
      ]),
    );
  });

  it("keeps the last content and offers retry when live updates stopped after repeated failures", async () => {
    const onRetryUpdates = vi.fn();
    const user = userEvent.setup();
    renderPanel(
      { status: "processing", resultFileUrl: null, errorMessage: null },
      { updatesUnavailable: true, onRetryUpdates },
    );

    const banner = screen.getByTestId("iteration-updates-unavailable");
    expect(banner).toHaveTextContent(/temporarily unavailable/i);

    await user.click(
      within(banner).getByRole("button", { name: /retry updates/i }),
    );
    expect(onRetryUpdates).toHaveBeenCalledTimes(1);
    // 内容仍在（未清空）
    expect(screen.getByTestId("iteration-context-prompt")).toHaveTextContent(
      "Precise neon cityscape at dusk with amber glass towers",
    );
  });
});

describe("IterationDetailPanel — failed variant", () => {
  it("maps the raw error message into business copy and keeps the context", () => {
    renderPanel({
      status: "failed",
      resultFileUrl: null,
      errorMessage: "Provider rejected the request after retries",
    });

    const panel = screen.getByTestId("iteration-detail-panel");
    expect(panel).toHaveAttribute("data-status", "failed");

    const failure = screen.getByTestId("iteration-failure-reason");
    expect(failure).toHaveTextContent(/generation failed/i);
    expect(failure).toHaveTextContent("Provider rejected the request after retries");
    expect(failure).toHaveTextContent(/preserved below/i);

    expect(screen.queryByTestId("iteration-result-image")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("iteration-reference-image")).getByRole("img"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("iteration-context-settings")).toHaveTextContent(
      "black-forest-2.5",
    );
    // 底部动作区：plan-04 默认主动作为“修正并继续”（同一恢复链路，AC-04）
    const actions = screen.getByTestId("iteration-detail-actions");
    expect(actions).toBeVisible();
    expect(
      within(actions).getByRole("button", { name: /fix (and|&) continue/i }),
    ).toBeInTheDocument();
  });

  it("falls back to a generic reason when no error message was recorded", () => {
    renderPanel({ status: "failed", resultFileUrl: null, errorMessage: null });

    expect(screen.getByTestId("iteration-failure-reason")).toHaveTextContent(
      /exact reason was not recorded/i,
    );
  });
});

describe("IterationDetailPanel — missing-source markers (L1/L2)", () => {
  it("marks a legacy fallback recipe and keeps the evidence readable", () => {
    renderPanel({ recipeSource: "fallback" });

    const evidence = screen.getByTestId("iteration-context-evidence");
    expect(evidence).toHaveAttribute("data-source", "fallback");
    expect(evidence).toHaveTextContent(/fallback|reconstructed|earlier record/i);
    expect(evidence).toHaveTextContent("warm amber and sand palette");
  });

  it("marks a missing recipe snapshot without blocking the other blocks", () => {
    renderPanel({ recipe: null, recipeSource: "missing" });

    const evidence = screen.getByTestId("iteration-context-evidence");
    expect(evidence).toHaveAttribute("data-source", "missing");
    expect(evidence).toHaveTextContent(/recipe from this attempt is missing/i);
    expect(screen.getByTestId("iteration-context-prompt")).toHaveTextContent(
      "Precise neon cityscape at dusk with amber glass towers",
    );
    expect(screen.getByTestId("iteration-result-image")).toBeInTheDocument();
  });

  it("marks missing variables while the exclusions stay visible", () => {
    renderPanel({ variables: [], variablesSource: "missing" });

    const variables = screen.getByTestId("iteration-context-variables");
    expect(variables).toHaveAttribute("data-source", "missing");
    expect(variables).toHaveTextContent(/variable values from this attempt are missing/i);
    expect(variables).toHaveTextContent("watermark, distorted glass");
  });

  it("replaces a missing reference image with a placeholder instead of a broken image", () => {
    renderPanel({ sourceImageUrl: null, sourceAssetId: null });

    expect(screen.getByTestId("iteration-reference-missing")).toBeVisible();
    expect(screen.getByTestId("iteration-reference-missing")).toHaveTextContent(
      /reference image for this attempt is missing/i,
    );
    expect(
      screen.queryByTestId("iteration-reference-image"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("iteration-result-image")).getByRole("img"),
    ).toBeInTheDocument();
  });

  it("degrades a reference image that fails to load to the placeholder", () => {
    renderPanel();

    fireEvent.error(
      within(screen.getByTestId("iteration-reference-image")).getByRole("img"),
    );

    expect(screen.getByTestId("iteration-reference-missing")).toBeVisible();
    expect(
      screen.queryByTestId("iteration-reference-image"),
    ).not.toBeInTheDocument();
  });

  it("degrades a result image that fails to load without losing the context", () => {
    renderPanel();

    fireEvent.error(
      within(screen.getByTestId("iteration-result-image")).getByRole("img"),
    );

    expect(screen.getByTestId("iteration-result-missing")).toBeVisible();
    expect(
      screen.queryByTestId("iteration-result-image"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("iteration-context-evidence")).toHaveTextContent(
      "warm amber and sand palette",
    );
  });
});

describe("IterationDetailPanel — security (architecture §8.3)", () => {
  it("renders snapshot text as plain text without interpreting HTML", () => {
    renderPanel({
      promptSnapshot: '<img src=x onerror="window.__pwned=1"><script>alert(1)</script>',
      negativePromptSnapshot: '<script>alert(2)</script>watermark',
    });

    const promptBlock = screen.getByTestId("iteration-context-prompt");
    expect(promptBlock).toHaveTextContent('<img src=x onerror="window.__pwned=1">');
    expect(promptBlock).toHaveTextContent("<script>alert(1)</script>");
    // 文本按字面渲染：块内没有真实 img/script 元素被创建
    expect(promptBlock.querySelector("img")).not.toBeInTheDocument();
    expect(promptBlock.querySelector("script")).not.toBeInTheDocument();

    const variables = screen.getByTestId("iteration-context-variables");
    expect(variables.querySelector("script")).not.toBeInTheDocument();
    expect(variables).toHaveTextContent("<script>alert(2)</script>watermark");
  });
});

describe("IterationDetailPanel — header navigation", () => {
  it("disables Previous/Next at the list boundaries", () => {
    renderPanel(undefined, { hasPrevious: false, hasNext: false });

    expect(
      screen.getByRole("button", { name: /previous/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /^next iteration$/i }),
    ).toBeDisabled();
  });

  it("forwards back/previous/next intents to the page callbacks", async () => {
    const user = userEvent.setup();
    const { onBackToList, onPrevious, onNext } = renderPanel();

    await user.click(screen.getByRole("button", { name: /back to list/i }));
    expect(onBackToList).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /previous/i }));
    expect(onPrevious).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /^next iteration$/i }),
    );
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("IterationDetailPanel — save as Style Memory secondary actions (plan-05 / 架构 §6.4、§5.2)", () => {
  it("未保存的 completed 详情（有真实结果 + 来源资产）显示保存入口，点击打开预填对话框", async () => {
    const user = userEvent.setup();
    renderPanel();

    const actions = screen.getByTestId("iteration-detail-actions");
    const saveEntry = within(actions).getByRole("button", {
      name: /save as style memory/i,
    });
    expect(saveEntry).toBeVisible();
    expect(screen.queryByTestId("iteration-saved-state")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("iteration-save-unavailable"),
    ).not.toBeInTheDocument();

    await user.click(saveEntry);

    const dialog = screen.getByTestId("save-style-memory-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");
    // 预填：内容 = promptSnapshot，名称初始为空
    expect(
      within(dialog).getByRole("textbox", { name: /prompt content/i }),
    ).toHaveValue("Precise neon cityscape at dusk with amber glass towers");
    expect(
      within(dialog).getByRole("textbox", { name: /^name$/i }),
    ).toHaveValue("");
  });

  it("savedTemplate 非空时渲染已保存态（含模板名与 Open），不再显示保存按钮", async () => {
    routerPushMock.mockClear();
    const user = userEvent.setup();
    renderPanel({ savedTemplate: { id: "tpl-saved-1", name: "Neon Dusk Memory" } });

    const savedState = screen.getByTestId("iteration-saved-state");
    expect(savedState).toHaveTextContent(/saved as style memory/i);
    expect(savedState).toHaveTextContent("Neon Dusk Memory");
    expect(
      screen.queryByTestId("iteration-save-unavailable"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("iteration-detail-actions")).queryByRole("button", {
        name: /save as style memory/i,
      }),
    ).not.toBeInTheDocument();

    // Open → /workspace/templates?focus=<id>
    await user.click(
      within(savedState).getByRole("button", { name: /^open$/i }),
    );
    expect(routerPushMock).toHaveBeenCalledWith(
      "/workspace/templates?focus=tpl-saved-1",
    );
  });

  it("sourceAssetId 缺失的 completed 详情显示来源缺失说明，不出现保存入口或已保存态", () => {
    renderPanel({ sourceAssetId: null });

    const note = screen.getByTestId("iteration-save-unavailable");
    expect(note).toBeVisible();
    expect(note).toHaveTextContent(/missing|cannot/i);
    expect(
      screen.queryByRole("button", { name: /save as style memory/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("iteration-saved-state")).not.toBeInTheDocument();
    // 其余详情不阻断：结果图仍在
    expect(screen.getByTestId("iteration-result-image")).toBeInTheDocument();
  });

  it("failed 与无真实结果的 completed 详情不出现任何保存入口或来源缺失说明", () => {
    const { unmount } = renderPanel({
      status: "failed",
      resultFileUrl: null,
      errorMessage: "Provider timeout",
    });
    expect(
      screen.queryByRole("button", { name: /save as style memory/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("iteration-save-unavailable"),
    ).not.toBeInTheDocument();
    unmount();

    renderPanel({ resultFileUrl: null });
    expect(
      screen.queryByRole("button", { name: /save as style memory/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("iteration-save-unavailable"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("iteration-saved-state")).not.toBeInTheDocument();
  });
});

describe("IterationDetailErrorFace", () => {
  it("explains the failure with retry and close actions", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(
      <IterationDetailErrorFace
        message="Iteration detail temporarily unavailable"
        onRetry={onRetry}
        onClose={onClose}
      />,
    );

    const face = screen.getByTestId("iteration-detail-error");
    expect(face).toHaveTextContent(/could not open this iteration/i);
    expect(face).toHaveTextContent("Iteration detail temporarily unavailable");
    expect(face).toHaveTextContent(/list, search, and filters stay exactly as they are/i);

    await user.click(within(face).getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await user.click(within(face).getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
