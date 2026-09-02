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
    await user.click(screen.getByRole("checkbox", { name: /Set as representative result/ }));
  }
  await user.click(screen.getByRole("button", { name: /^Next$/ }));
  const step2 = screen.getByTestId("save-wizard-step-2");
  if (options.editEnvironment) {
    await user.clear(within(step2).getByLabelText(/environment/i));
    await user.type(within(step2).getByLabelText(/environment/i), options.editEnvironment);
  }
  await user.click(screen.getByRole("button", { name: /^Next$/ }));
  return screen.getByTestId("save-wizard-step-3");
}

describe("StyleMemorySaveWizard — 三步结构（流程 A，架构 §6.3 / §4.2-⑤）", () => {
  it("step 1: side-by-side reference and result + Set as representative result unchecked by default + verified semantics note", () => {
    renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(screen.getByTestId("save-wizard-step-1")).toBeVisible();
    expect(screen.getByText(/Step 1 \/ 3/)).toBeVisible();

    const step1 = screen.getByTestId("save-wizard-step-1");
    const referenceImg = within(step1).getByRole("img", { name: /Reference/ });
    expect(referenceImg).toHaveAttribute(
      "src",
      "https://cdn.example.com/references/iter-001/original.png",
    );
    expect(
      within(step1).getByRole("img", { name: /Result from this iteration/ }),
    ).toHaveAttribute("src", "https://cdn.example.com/generated/iter-001/result.webp");
    expect(within(step1).getByText("Reference", { exact: true })).toBeVisible();
    expect(within(step1).getByText("Result", { exact: true })).toBeVisible();

    const checkbox = screen.getByRole("checkbox", { name: /Set as representative result/ });
    expect(checkbox).not.toBeChecked();
    expect(step1).toHaveTextContent(/User verified/);
  });

  it("legacy data boundary: missing source reference shows the Source image missing placeholder in step 1, result renders normally", () => {
    renderDialog({ sourceImageUrl: null });

    const step1 = screen.getByTestId("save-wizard-step-1");
    expect(within(step1).getByText("Source image missing")).toBeVisible();
    expect(within(step1).queryByRole("img", { name: /Reference/ })).toBeNull();
    // 结果图不受来源缺失影响，向导流程可继续（下一步可用）
    expect(
      within(step1).getByRole("img", { name: /Result from this iteration/ }),
    ).toHaveAttribute("src", "https://cdn.example.com/generated/iter-001/result.webp");
    expect(screen.getByRole("button", { name: /^Next$/ })).toBeEnabled();
  });

  it("step 2: V2 prefilled rules (hard first) / constraints / read-only snapshots + editable variable defaults on the same screen", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: /^Next$/ }));

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

  it("step round-trip keeps content: unchecking representative in step 1 updates the status line to Pending verification", async () => {
    const user = userEvent.setup();
    renderDialog();
    await walkToStep3({ representative: true });

    const step3 = screen.getByTestId("save-wizard-step-3");
    expect(step3).toHaveTextContent("After saving: User verified");

    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    expect(screen.getByTestId("save-wizard-step-1")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: /Set as representative result/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByTestId("save-wizard-step-3")).toHaveTextContent(
      "After saving: Pending verification",
    );
  });

  it("advanced section collapsed by default; full prompt visible and editable after expanding", async () => {
    const user = userEvent.setup();
    renderDialog();
    await walkToStep3();

    const step3 = screen.getByTestId("save-wizard-step-3");
    expect(step3.textContent).not.toContain(INITIAL_CONTENT);

    await user.click(
      screen.getByRole("button", { name: /Advanced/ }),
    );
    const contentInput = within(step3).getByLabelText(/Full prompt \(editable/);
    expect(contentInput).toHaveValue(INITIAL_CONTENT);
    await user.type(contentInput, " revised");
    expect(contentInput).toHaveValue(`${INITIAL_CONTENT} revised`);
  });

  it("step 3 first render has no required error (neutral help present); empty-name submit shows error and sends no request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();
    await walkToStep3();

    const step3 = screen.getByTestId("save-wizard-step-3");
    expect(step3).toHaveTextContent(/1-50 characters/);
    expect(step3.textContent).not.toMatch(/Required|cannot be empty/);

    await user.click(screen.getByRole("button", { name: /^Save/ }));
    expect(within(step3).getByText(/cannot be empty/)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("StyleMemorySaveWizard — 提交契约（POST /api/templates 扩展体）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    routerPushMock.mockClear();
  });

  it("representative checked: body carries the rule quadruple, edited variables and representativeGenerationTaskId; success navigates to the new detail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "tpl-saved-1", name: "Neon Dusk Memory" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    await walkToStep3({ representative: true, editEnvironment: "night market stall" });
    await user.type(screen.getByLabelText(/^Name$/), "Neon Dusk Memory");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

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

  it("representative unchecked: body omits representativeGenerationTaskId (source iteration still carried)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "tpl-saved-2", name: "Pending memory" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    await walkToStep3();
    await user.type(screen.getByLabelText(/^Name$/), "Pending memory");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(
      String(fetchMock.mock.calls[0][1].body),
    ) as Record<string, unknown>;
    expect(body.representativeGenerationTaskId).toBeUndefined();
    expect(body.sourceGenerationTaskId).toBe("iter-001");
  });

  it("saving locks submit and cancel buttons (no duplicate submit)", async () => {
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
    await user.type(screen.getByLabelText(/^Name$/), "Locked memory");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByTestId("save-wizard-step-3")).toHaveTextContent(
      "After saving: User verified",
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

  it("409 name conflict: server copy shown as-is, step 3 with name and checkbox preserved; rename and retry succeeds", async () => {
    const conflictCopy = "A template with this name already exists";
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
    await user.type(screen.getByLabelText(/^Name$/), "Conflict memory");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    const step3 = screen.getByTestId("save-wizard-step-3");
    await waitFor(() => expect(step3).toHaveTextContent(conflictCopy));
    expect(screen.getByLabelText(/^Name$/)).toHaveValue("Conflict memory");
    expect(step3).toHaveTextContent("After saving: User verified");

    const nameInput = screen.getByLabelText(/^Name$/);
    await user.clear(nameInput);
    await user.type(nameInput, "Conflict v2");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(
      String(fetchMock.mock.calls[1][1].body),
    ) as Record<string, unknown>;
    expect(retryBody.name).toBe("Conflict v2");
    expect(retryBody.representativeGenerationTaskId).toBe("iter-001");
  });

  it("5xx transient failure: error banner shown, direct retry succeeds and the body matches the first attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(503, {
          error: "Saving is temporarily unavailable. Please try again later.",
          code: "SERVICE_UNAVAILABLE",
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { id: "tpl-retry-2", name: "Retry" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    await walkToStep3({ representative: true });
    await user.type(screen.getByLabelText(/^Name$/), "Retry");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    const step3 = screen.getByTestId("save-wizard-step-3");
    await waitFor(() => expect(step3).toHaveTextContent(/temporarily unavailable/));
    expect(screen.getByLabelText(/^Name$/)).toHaveValue("Retry");

    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/workspace/templates/tpl-retry-2"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  it("network error: retryable copy shown, filled content preserved", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    await walkToStep3();
    await user.type(screen.getByLabelText(/^Name$/), "Network attempt");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() =>
      expect(screen.getByTestId("save-wizard-step-3")).toHaveTextContent(
        /temporarily unavailable/,
      ),
    );
    expect(screen.getByLabelText(/^Name$/)).toHaveValue("Network attempt");
  });
});

describe("StyleMemorySaveWizard — 重置与关闭", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reopening after close: reset to step 1 with prefilled initial state (name cleared, checkbox reset)", async () => {
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

    await user.click(screen.getByRole("checkbox", { name: /Set as representative result/ }));
    await walkToStep3FromMounted();
    await user.type(screen.getByLabelText(/^Name$/), "Leftover name");

    rerender(<SaveStyleMemoryDialog {...props} open={false} />);
    expect(
      screen.queryByTestId("save-style-memory-dialog"),
    ).not.toBeInTheDocument();
    rerender(<SaveStyleMemoryDialog {...props} open />);

    expect(screen.getByTestId("save-wizard-step-1")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /Set as representative result/ })).not.toBeChecked();
  });

  it("cancel only triggers onClose and sends no request; Escape behaves the same", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
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
  await user.click(screen.getByRole("button", { name: /^Next$/ }));
  await user.click(screen.getByRole("button", { name: /^Next$/ }));
}

describe("StyleMemorySaveWizard — plan-06 工作台 preferred 入口（预选代表结果）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    routerPushMock.mockClear();
  });

  it("defaultRepresentative：打开即勾选「Set as representative result」，状态行联动 User verified", () => {
    renderDialog({ defaultRepresentative: true });

    expect(
      screen.getByRole("checkbox", { name: /Set as representative result/ }),
    ).toBeChecked();
    // 步骤 1 的勾选即时联动「保存后状态」
    expect(screen.getByTestId("save-wizard-step-1")).toHaveTextContent(
      /User verified/,
    );
  });

  it("预选入口取消零写入：Cancel 只触发 onClose，不发任何 create 请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved, onClose } = renderDialog({ defaultRepresentative: true });

    await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("预选入口直接提交：无需再勾选，提交体携带 representativeGenerationTaskId = 来源迭代", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "tpl-pref-1", name: "Preferred direction memory" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderDialog({ defaultRepresentative: true });

    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.type(screen.getByLabelText(/^Name$/), "Preferred direction memory");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      String(fetchMock.mock.calls[0][1].body),
    ) as Record<string, unknown>;
    expect(body.sourceGenerationTaskId).toBe("iter-001");
    expect(body.representativeGenerationTaskId).toBe("iter-001");
  });

  it("预选入口失败保留：5xx 后向导内容与预选保留，重试成功后提交体一致", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(503, {
          error: "Saving is temporarily unavailable. Please try again later.",
          code: "SERVICE_UNAVAILABLE",
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, { id: "tpl-pref-2", name: "Preferred retry" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog({ defaultRepresentative: true });

    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.type(screen.getByLabelText(/^Name$/), "Preferred retry");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() =>
      expect(screen.getByTestId("save-wizard-step-3")).toHaveTextContent(
        /temporarily unavailable/,
      ),
    );
    // 失败保留：名称与预选代表结果不丢（回步骤 1 仍勾选）
    expect(screen.getByLabelText(/^Name$/)).toHaveValue("Preferred retry");
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    await user.click(screen.getByRole("button", { name: /^Back$/ }));
    expect(
      screen.getByRole("checkbox", { name: /Set as representative result/ }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/workspace/templates/tpl-pref-2"),
    );
    const retryBody = JSON.parse(
      String(fetchMock.mock.calls[1][1].body),
    ) as Record<string, unknown>;
    expect(retryBody.representativeGenerationTaskId).toBe("iter-001");
  });
});

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

  it("first screen is step 2 + no-representative note (Pending verification expectation), no step 1 or checkbox", () => {
    renderDraft();

    const note = screen.getByTestId("save-wizard-no-representative-note");
    expect(note).toBeVisible();
    expect(note).toHaveTextContent(/No representative result yet/);
    expect(note).toHaveTextContent(/Pending verification/);
    expect(screen.queryByTestId("save-wizard-step-1")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /Set as representative result/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Step 1 \/ 2/)).toBeVisible();
  });

  it("body omits representative/sourceGenerationTask, carries source asset and analysis task, status fixed to Pending verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "tpl-draft-1", name: "Workspace Draft" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDraft();

    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    const step3 = screen.getByTestId("save-wizard-step-3");
    expect(step3).toHaveTextContent("After saving: Pending verification");
    await user.type(screen.getByLabelText(/^Name$/), "Workspace Draft");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

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

  it("fallback recipe: four missing markers (No X from this iteration), flow continues", async () => {
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
    const missingMarks = within(step2).getAllByText(/No .* from this iteration/);
    expect(missingMarks.length).toBeGreaterThanOrEqual(4);
    expect(step2.textContent).not.toContain("warm amber and sand palette");

    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByTestId("save-wizard-step-3")).toBeVisible();
  });
});
