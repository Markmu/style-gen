// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SaveStyleMemoryDialog,
  StyleMemorySaveWizard,
  type SaveStyleMemoryDialogProps,
} from "@/components/iterations/save-style-memory-dialog";
import {
  STYLE_DIMENSIONS,
  type IterationContextSource,
  type StoredVisualRecipe,
  type StyleDimension,
  type StyleObservation,
  type StyleFingerprintScoreKey,
  type TemplateVariable,
} from "@/types/models";

/**
 * plan-06 Task 3: 保存为 Style Memory 三步向导组件测试（流程 A + 共享骨架）。
 *
 * 覆盖：三步结构与往返不丢内容、步骤 1 代表结果默认不勾选、步骤 2 V2 预填与
 * 变量默认值编辑、步骤 3 命名校验（无提前报错）与"保存后状态"联动、提交体
 * SaveStyleMemoryRequest（含规则四元组与代表结果，不含 verificationStatus）、
 * 409/5xx 失败保留与重试、流程 B（workspace-draft）无代表结果分支。
 */

const routerPushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

const INITIAL_CONTENT = "Neon dusk hero study with amber glass towers";
const INITIAL_VARIABLES: TemplateVariable[] = [
  { name: "subject", label: "Subject", defaultValue: "amber bottle", sourceField: "subject" },
  {
    name: "environment",
    label: "Environment",
    defaultValue: "quiet studio table",
    sourceField: "environment",
  },
];

function emptyStyleProfile(): Record<StyleDimension, StyleObservation[]> {
  return Object.fromEntries(
    STYLE_DIMENSIONS.map((dimension) => [dimension, []]),
  ) as Record<StyleDimension, StyleObservation[]>;
}

const V2_RECIPE: StoredVisualRecipe = {
  schemaVersion: 2,
  extractionStatus: "ready",
  extractionReasons: [],
  contentDescription: {
    summary: "An amber bottle on a quiet studio table",
    subjectAttributes: [],
    supportingElements: [],
  },
  styleProfile: emptyStyleProfile(),
  styleInvariants: [
    {
      id: "inv-hard-1",
      kind: "hard",
      dimension: "color",
      value: "warm amber and sand palette",
      evidence: [],
      confidence: 0.92,
      sourceObservationIds: [],
    },
    {
      id: "inv-soft-1",
      kind: "soft",
      dimension: "atmosphere",
      value: "calm restrained mood",
      evidence: [],
      confidence: 0.8,
      sourceObservationIds: [],
    },
  ],
  contentVariables: [],
  optionalModifiers: [
    {
      name: "mood",
      label: "Mood",
      defaultValue: "calm",
      dimension: "atmosphere",
      enabledByDefault: false,
    },
  ],
  negativeConstraints: ["watermark", "distorted glass"],
  styleFingerprint: {
    tokens: ["editorial", "warm neutral"],
    scores: {} as Record<StyleFingerprintScoreKey, number | null>,
  },
  promptOutputs: {
    reconstructionPrompt: "",
    conciseTemplate: "",
    standardTemplate: "",
    professionalTemplate: "",
  },
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDialog(
  overrides: Partial<SaveStyleMemoryDialogProps> = {},
): { onSaved: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <SaveStyleMemoryDialog
      open
      promptSnapshot={INITIAL_CONTENT}
      variables={INITIAL_VARIABLES}
      negativePromptSnapshot="heavy grain overlay"
      recipe={V2_RECIPE}
      recipeSource="snapshot"
      sourceImageUrl="https://cdn.example.com/references/iter-001/original.png"
      resultFileUrl="https://cdn.example.com/generated/iter-001/result.webp"
      sourceAssetId="asset-iter-001"
      sourceGenerationTaskId="iter-001"
      onSaved={onSaved}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSaved, onClose };
}

/** 从步骤 1 直达步骤 3（含可选勾选代表结果与变量编辑） */
async function walkToStep3(
  options: { representative?: boolean; editEnvironment?: string } = {},
) {
  const user = userEvent.setup();
  if (options.representative) {
    await user.click(screen.getByRole("checkbox", { name: /设为代表结果/ }));
  }
  await user.click(screen.getByRole("button", { name: /下一步/ }));
  const step2 = screen.getByTestId("save-wizard-step-2");
  if (options.editEnvironment) {
    await user.clear(within(step2).getByLabelText(/environment/i));
    await user.type(within(step2).getByLabelText(/environment/i), options.editEnvironment);
  }
  await user.click(screen.getByRole("button", { name: /下一步/ }));
  return screen.getByTestId("save-wizard-step-3");
}

describe("StyleMemorySaveWizard — 三步结构（流程 A，架构 §6.3 / §4.2-⑤）", () => {
  it("步骤 1：并排参考图与本次结果 +「设为代表结果」默认不勾选 + 已验证语义说明", () => {
    renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(screen.getByTestId("save-wizard-step-1")).toBeVisible();
    expect(screen.getByText(/步骤 1 \/ 3/)).toBeVisible();

    const step1 = screen.getByTestId("save-wizard-step-1");
    const referenceImg = within(step1).getByRole("img", { name: /参考图/ });
    expect(referenceImg).toHaveAttribute(
      "src",
      "https://cdn.example.com/references/iter-001/original.png",
    );
    expect(
      within(step1).getByRole("img", { name: /本次结果/ }),
    ).toHaveAttribute("src", "https://cdn.example.com/generated/iter-001/result.webp");
    expect(within(step1).getByText("参考图", { exact: true })).toBeVisible();
    expect(within(step1).getByText("本次结果", { exact: true })).toBeVisible();

    const checkbox = screen.getByRole("checkbox", { name: /设为代表结果/ });
    expect(checkbox).not.toBeChecked();
    expect(step1).toHaveTextContent(/用户已验证/);
  });

  it("旧数据边界：来源参考图缺失时步骤 1 显示「来源图缺失」占位，本次结果正常", () => {
    renderDialog({ sourceImageUrl: null });

    const step1 = screen.getByTestId("save-wizard-step-1");
    expect(within(step1).getByText("来源图缺失")).toBeVisible();
    expect(within(step1).queryByRole("img", { name: /参考图/ })).toBeNull();
    // 结果图不受来源缺失影响，向导流程可继续（下一步可用）
    expect(
      within(step1).getByRole("img", { name: /本次结果/ }),
    ).toHaveAttribute("src", "https://cdn.example.com/generated/iter-001/result.webp");
    expect(screen.getByRole("button", { name: /下一步/ })).toBeEnabled();
  });

  it("步骤 2：V2 预填规则（hard 优先）/排除约束/只读快照 + 变量默认值同屏可编辑", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: /下一步/ }));

    const step2 = screen.getByTestId("save-wizard-step-2");
    // 保留规则来自配方不变量值（soft 排在 hard 之后）
    const softIndex = step2.textContent?.indexOf("calm restrained mood") ?? -1;
    expect(softIndex).toBeGreaterThan(
      step2.textContent?.indexOf("warm amber and sand palette") ?? -1,
    );
    // 排除约束来自配方而非负面提示快照
    expect(within(step2).getByText("watermark", { exact: true })).toBeVisible();
    expect(step2.textContent).not.toContain("heavy grain overlay");
    // 只读快照
    expect(within(step2).getByText("editorial", { exact: true })).toBeVisible();
    expect(within(step2).getByText("calm", { exact: true })).toBeVisible();
    // 变量默认值可编辑
    const environment = within(step2).getByLabelText(/environment/i);
    expect(environment).toHaveValue("quiet studio table");
    await user.clear(environment);
    await user.type(environment, "night market stall");
    expect(environment).toHaveValue("night market stall");
  });

  it("步骤往返不丢内容：步骤 3 回步骤 1 取消勾选后，状态文案联动为待验证", async () => {
    const user = userEvent.setup();
    renderDialog();
    await walkToStep3({ representative: true });

    const step3 = screen.getByTestId("save-wizard-step-3");
    expect(step3).toHaveTextContent("保存后状态：用户已验证");

    await user.click(screen.getByRole("button", { name: /上一步/ }));
    await user.click(screen.getByRole("button", { name: /上一步/ }));
    expect(screen.getByTestId("save-wizard-step-1")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: /设为代表结果/ }));
    await user.click(screen.getByRole("button", { name: /下一步/ }));
    await user.click(screen.getByRole("button", { name: /下一步/ }));
    expect(screen.getByTestId("save-wizard-step-3")).toHaveTextContent(
      "保存后状态：待验证",
    );
  });

  it("高级信息默认折叠，展开后完整提示可见且可编辑", async () => {
    const user = userEvent.setup();
    renderDialog();
    await walkToStep3();

    const step3 = screen.getByTestId("save-wizard-step-3");
    expect(step3.textContent).not.toContain(INITIAL_CONTENT);

    await user.click(
      screen.getByRole("button", { name: /高级信息|完整提示/ }),
    );
    const contentInput = within(step3).getByLabelText(/完整提示（可编辑/);
    expect(contentInput).toHaveValue(INITIAL_CONTENT);
    await user.type(contentInput, " revised");
    expect(contentInput).toHaveValue(`${INITIAL_CONTENT} revised`);
  });

  it("步骤 3 首渲染无必填错误（中性帮助存在），空名提交报错且不发请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();
    await walkToStep3();

    const step3 = screen.getByTestId("save-wizard-step-3");
    expect(step3).toHaveTextContent(/1-50 个字符/);
    expect(step3.textContent).not.toMatch(/必填|不能为空/);

    await user.click(screen.getByRole("button", { name: /^保存/ }));
    expect(within(step3).getByText(/不能为空/)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("StyleMemorySaveWizard — 提交契约（POST /api/templates 扩展体）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    routerPushMock.mockClear();
  });

  it("勾选代表结果：提交体携带规则四元组、编辑后变量与 representativeGenerationTaskId，成功跳转新详情", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "tpl-saved-1", name: "Neon Dusk Memory" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    await walkToStep3({ representative: true, editEnvironment: "night market stall" });
    await user.type(screen.getByLabelText(/^名称$/), "Neon Dusk Memory");
    await user.click(screen.getByRole("button", { name: /^保存/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith({
      id: "tpl-saved-1",
      name: "Neon Dusk Memory",
    });
    expect(routerPushMock).toHaveBeenCalledWith("/workspace/templates/tpl-saved-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/templates");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.name).toBe("Neon Dusk Memory");
    expect(body.content).toBe(INITIAL_CONTENT);
    expect(body.retainedRules).toEqual([
      "warm amber and sand palette",
      "calm restrained mood",
    ]);
    expect(body.negativeConstraints).toEqual(["watermark", "distorted glass"]);
    expect(body.styleTokens).toEqual(["editorial", "warm neutral"]);
    expect(body.enhancementHints).toEqual(["calm"]);
    expect(body.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "subject", defaultValue: "amber bottle" }),
        expect.objectContaining({
          name: "environment",
          defaultValue: "night market stall",
        }),
      ]),
    );
    expect(body.sourceAssetId).toBe("asset-iter-001");
    expect(body.sourceGenerationTaskId).toBe("iter-001");
    expect(body.representativeGenerationTaskId).toBe("iter-001");
    expect(body.verificationStatus).toBeUndefined();
  });

  it("不勾选：提交体不带 representativeGenerationTaskId（来源迭代仍携带）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "tpl-saved-2", name: "Pending memory" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    await walkToStep3();
    await user.type(screen.getByLabelText(/^名称$/), "Pending memory");
    await user.click(screen.getByRole("button", { name: /^保存/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(
      String(fetchMock.mock.calls[0][1].body),
    ) as Record<string, unknown>;
    expect(body.representativeGenerationTaskId).toBeUndefined();
    expect(body.sourceGenerationTaskId).toBe("iter-001");
  });

  it("保存进行中锁定提交与取消按钮（防重复提交）", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await walkToStep3({ representative: true });
    await user.type(screen.getByLabelText(/^名称$/), "Locked memory");
    await user.click(screen.getByRole("button", { name: /^保存/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /保存中/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByTestId("save-wizard-step-3")).toHaveTextContent(
      "保存后状态：用户已验证",
    );

    resolveFetch?.(jsonResponse(201, { id: "tpl-locked", name: "Locked memory" }));
    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/workspace/templates/tpl-locked"),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("StyleMemorySaveWizard — 失败保留与无损重试（AC-11）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    routerPushMock.mockClear();
  });

  it("409 同名冲突：服务端文案原样呈现，步骤 3 与名称、勾选状态保留，改名重试成功", async () => {
    const conflictCopy = "同名 Style Memory 已存在，请换一个名称后重试";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(409, { error: conflictCopy, code: "TEMPLATE_NAME_CONFLICT" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, { id: "tpl-retry-1", name: "Conflict v2" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    await walkToStep3({ representative: true });
    await user.type(screen.getByLabelText(/^名称$/), "Conflict memory");
    await user.click(screen.getByRole("button", { name: /^保存/ }));

    const step3 = screen.getByTestId("save-wizard-step-3");
    await waitFor(() => expect(step3).toHaveTextContent(conflictCopy));
    expect(screen.getByLabelText(/^名称$/)).toHaveValue("Conflict memory");
    expect(step3).toHaveTextContent("保存后状态：用户已验证");

    const nameInput = screen.getByLabelText(/^名称$/);
    await user.clear(nameInput);
    await user.type(nameInput, "Conflict v2");
    await user.click(screen.getByRole("button", { name: /^保存/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(
      String(fetchMock.mock.calls[1][1].body),
    ) as Record<string, unknown>;
    expect(retryBody.name).toBe("Conflict v2");
    expect(retryBody.representativeGenerationTaskId).toBe("iter-001");
  });

  it("5xx 暂时失败：错误条呈现，直接重试成功且提交体与首次一致", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(503, {
          error: "保存暂时不可用，请稍后重试",
          code: "SERVICE_UNAVAILABLE",
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { id: "tpl-retry-2", name: "Retry" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    await walkToStep3({ representative: true });
    await user.type(screen.getByLabelText(/^名称$/), "Retry");
    await user.click(screen.getByRole("button", { name: /^保存/ }));

    const step3 = screen.getByTestId("save-wizard-step-3");
    await waitFor(() => expect(step3).toHaveTextContent(/保存暂时不可用/));
    expect(screen.getByLabelText(/^名称$/)).toHaveValue("Retry");

    await user.click(screen.getByRole("button", { name: /^保存/ }));
    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/workspace/templates/tpl-retry-2"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  it("网络异常：可重试文案呈现，已填内容保留", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    await walkToStep3();
    await user.type(screen.getByLabelText(/^名称$/), "Network attempt");
    await user.click(screen.getByRole("button", { name: /^保存/ }));

    await waitFor(() =>
      expect(screen.getByTestId("save-wizard-step-3")).toHaveTextContent(
        /保存暂时不可用/,
      ),
    );
    expect(screen.getByLabelText(/^名称$/)).toHaveValue("Network attempt");
  });
});

describe("StyleMemorySaveWizard — 重置与关闭", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("关闭后重新打开：重置回步骤 1 与预填初始态（名称清空、勾选复位）", async () => {
    const user = userEvent.setup();
    const props: SaveStyleMemoryDialogProps = {
      open: true,
      promptSnapshot: INITIAL_CONTENT,
      variables: INITIAL_VARIABLES,
      negativePromptSnapshot: "heavy grain overlay",
      recipe: V2_RECIPE,
      recipeSource: "snapshot",
      sourceImageUrl: "https://cdn.example.com/references/iter-001/original.png",
      resultFileUrl: "https://cdn.example.com/generated/iter-001/result.webp",
      sourceAssetId: "asset-iter-001",
      sourceGenerationTaskId: "iter-001",
      onSaved: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<SaveStyleMemoryDialog {...props} />);

    await user.click(screen.getByRole("checkbox", { name: /设为代表结果/ }));
    await walkToStep3FromMounted();
    await user.type(screen.getByLabelText(/^名称$/), "Leftover name");

    rerender(<SaveStyleMemoryDialog {...props} open={false} />);
    expect(
      screen.queryByTestId("save-style-memory-dialog"),
    ).not.toBeInTheDocument();
    rerender(<SaveStyleMemoryDialog {...props} open />);

    expect(screen.getByTestId("save-wizard-step-1")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /设为代表结果/ })).not.toBeChecked();
  });

  it("取消只触发 onClose，不发请求；Escape 同语义", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

/** 已挂载向导内直达步骤 3（复用全局 screen 查询） */
async function walkToStep3FromMounted() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /下一步/ }));
  await user.click(screen.getByRole("button", { name: /下一步/ }));
}

describe("StyleMemorySaveWizard — 流程 B（workspace-draft，无代表结果）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    routerPushMock.mockClear();
  });

  function renderDraft(overrides: Partial<Parameters<typeof StyleMemorySaveWizard>[0]> = {}) {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <StyleMemorySaveWizard
        open
        flow="workspace-draft"
        initialContent="Workspace draft prompt"
        initialVariables={INITIAL_VARIABLES}
        recipe={V2_RECIPE}
        recipeSource="snapshot"
        negativePromptText="heavy grain overlay"
        sourceAssetId="asset-draft-001"
        sourceAnalysisTaskId="analysis-draft-001"
        sourceImageUrl="https://cdn.example.com/references/draft/original.png"
        onSaved={onSaved}
        onClose={onClose}
        {...overrides}
      />,
    );
    return { onSaved, onClose };
  }

  it("首屏为步骤 2 + 无代表结果说明（待验证预期），无步骤 1 与勾选框", () => {
    renderDraft();

    const note = screen.getByTestId("save-wizard-no-representative-note");
    expect(note).toBeVisible();
    expect(note).toHaveTextContent(/当前没有代表结果/);
    expect(note).toHaveTextContent(/待验证/);
    expect(screen.queryByTestId("save-wizard-step-1")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /设为代表结果/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/步骤 1 \/ 2/)).toBeVisible();
  });

  it("提交体不含 representative/sourceGenerationTask，携带来源资产与分析任务，状态固定待验证", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "tpl-draft-1", name: "Workspace Draft" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDraft();

    await user.click(screen.getByRole("button", { name: /下一步/ }));
    const step3 = screen.getByTestId("save-wizard-step-3");
    expect(step3).toHaveTextContent("保存后状态：待验证");
    await user.type(screen.getByLabelText(/^名称$/), "Workspace Draft");
    await user.click(screen.getByRole("button", { name: /^保存/ }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/workspace/templates/tpl-draft-1"),
    );
    const body = JSON.parse(
      String(fetchMock.mock.calls[0][1].body),
    ) as Record<string, unknown>;
    expect(body.representativeGenerationTaskId).toBeUndefined();
    expect(body.sourceGenerationTaskId).toBeUndefined();
    expect(body.sourceAssetId).toBe("asset-draft-001");
    expect(body.sourceAnalysisTaskId).toBe("analysis-draft-001");
    expect(body.verificationStatus).toBeUndefined();
  });

  it("fallback 配方：四组缺失标记（本次迭代无 X），流程可继续", async () => {
    const user = userEvent.setup();
    renderDraft({
      recipe: {
        schemaVersion: 2,
        extractionStatus: "fallback",
        extractionReasons: ["structure_failed"],
        promptOutputs: null,
      } satisfies StoredVisualRecipe,
      recipeSource: "fallback" as IterationContextSource,
    });

    const step2 = screen.getByTestId("save-wizard-step-2");
    const missingMarks = within(step2).getAllByText(/本次迭代无/);
    expect(missingMarks.length).toBeGreaterThanOrEqual(4);
    expect(step2.textContent).not.toContain("warm amber and sand palette");

    await user.click(screen.getByRole("button", { name: /下一步/ }));
    expect(screen.getByTestId("save-wizard-step-3")).toBeVisible();
  });
});
