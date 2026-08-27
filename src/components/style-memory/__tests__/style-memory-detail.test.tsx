// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

import { StyleMemoryDetailView } from "@/components/style-memory/style-memory-detail-view";
import { StyleMemoryEditForm } from "@/components/style-memory/style-memory-edit-form";
import type { StyleMemoryDetail } from "@/types/models";

/** 已验证 Memory：四分区数据完整（分区渲染基准） */
const VERIFIED_DETAIL: StyleMemoryDetail = {
  id: "memory-verified",
  name: "Editorial Soft Daylight",
  description: "从 8 月编辑部拍摄保存的柔和日光方向",
  content:
    "Create {{subject}} in {{scene}} with soft diffused daylight, fine grain texture.",
  variables: [
    { name: "subject", defaultValue: "玻璃器皿", label: "主体" },
    { name: "scene", defaultValue: "", label: "场景" },
  ],
  retainedRules: ["光线柔和、无硬阴影", "材质保留细颗粒与纸张感"],
  negativeConstraints: ["避免高饱和霓虹色"],
  styleTokens: ["低饱和暖灰", "柔和漫射光"],
  enhancementHints: ["编辑式排版留白"],
  verificationStatus: "user_verified",
  representativeGenerationTaskId: "gen-representative-01",
  sourceAssetId: "asset-1",
  sourceImageUrl: "https://cdn.example.com/references/source/original.webp",
  sourceGenerationTaskId: "gen-source-01",
  sourceGenerationTask: { id: "gen-source-01", createdAt: "2026-08-10T08:00:00.000Z" },
  representativeResult: {
    iterationId: "gen-representative-01",
    imageUrl: "https://cdn.example.com/results/representative.webp",
    createdAt: "2026-08-12T08:00:00.000Z",
  },
  usage: { lastUsedAt: "2026-08-20T10:00:00.000Z", derivedIterationCount: 3 },
  userId: "user-1",
  createdAt: "2026-08-10T08:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

/** 旧资产：规则/来源图/来源迭代/代表结果全缺（缺失分区标注基准） */
const LEGACY_DETAIL: StyleMemoryDetail = {
  ...VERIFIED_DETAIL,
  id: "memory-legacy",
  name: "Early Prompt Draft",
  description: null,
  content: "Legacy draft prompt with {{subject}} placeholder",
  variables: [{ name: "subject", defaultValue: "" }],
  retainedRules: [],
  negativeConstraints: [],
  styleTokens: [],
  enhancementHints: [],
  verificationStatus: "pending_verification",
  representativeGenerationTaskId: null,
  sourceAssetId: null,
  sourceImageUrl: null,
  sourceGenerationTaskId: null,
  sourceGenerationTask: null,
  representativeResult: null,
  usage: { lastUsedAt: null, derivedIterationCount: 1 },
};

describe("StyleMemoryDetailView（plan-05 四分区视图）", () => {
  it("渲染四分区 + 使用情况；完整提示默认收起且不可见", () => {
    render(
      <StyleMemoryDetailView detail={VERIFIED_DETAIL} onSelectRepresentative={() => undefined} />,
    );

    // 验证依据：参考图 + 代表结果并排 + 图注 + 来源 Iteration 链接（focus 定位）
    const evidence = screen.getByTestId("style-memory-detail-evidence");
    expect(within(evidence).getByText("参考图")).toBeInTheDocument();
    expect(within(evidence).getByText("代表结果")).toBeInTheDocument();
    expect(
      within(evidence).getByRole("img", { name: "Editorial Soft Daylight 的参考图" }),
    ).toBeInTheDocument();
    expect(
      within(evidence).getByRole("img", { name: "Editorial Soft Daylight 的代表结果" }),
    ).toBeInTheDocument();
    const sourceLink = within(evidence).getByRole("link", { name: /打开/ });
    expect(sourceLink).toHaveAttribute("href", "/workspace/iterations?focus=gen-source-01");

    // 保留的风格：风格指纹 + 核心保留规则
    const style = screen.getByTestId("style-memory-detail-style");
    expect(within(style).getByText("保留的风格")).toBeInTheDocument();
    expect(within(style).getByText("低饱和暖灰")).toBeInTheDocument();
    expect(within(style).getByText("光线柔和、无硬阴影")).toBeInTheDocument();

    // 可替换内容：默认值逐项 + 空默认值「必填」
    const variables = screen.getByTestId("style-memory-detail-variables");
    expect(within(variables).getByText("可替换内容")).toBeInTheDocument();
    expect(within(variables).getByText("玻璃器皿")).toBeInTheDocument();
    expect(within(variables).getByText("必填")).toBeInTheDocument();

    // 排除约束与增强方向
    const constraints = screen.getByTestId("style-memory-detail-constraints");
    expect(within(constraints).getByText("避免高饱和霓虹色")).toBeInTheDocument();
    expect(within(constraints).getByText("编辑式排版留白")).toBeInTheDocument();

    // 完整提示默认不可见（高级信息折叠区收起）
    expect(screen.queryByText(/fine grain texture/)).not.toBeInTheDocument();

    // 使用情况：最近使用（含年份）+ 派生次数
    const usage = screen.getByTestId("style-memory-detail-usage");
    expect(within(usage).getByText(/最近使用/)).toBeInTheDocument();
    expect(within(usage).getByText(/2026/)).toBeInTheDocument();
    expect(within(usage).getByText(/派生.*3.*次/)).toBeInTheDocument();
    expect(within(usage).queryByText("尚未使用")).not.toBeInTheDocument();
  });

  it("完整提示在高级信息展开后可见", async () => {
    const user = userEvent.setup();
    render(
      <StyleMemoryDetailView detail={VERIFIED_DETAIL} onSelectRepresentative={() => undefined} />,
    );

    await user.click(screen.getByRole("button", { name: /完整提示|高级信息/ }));

    expect(await screen.findByText(/fine grain texture/)).toBeInTheDocument();
  });

  it("待验证且无代表结果：验证依据区显示选择引导与入口，不渲染代表结果图", () => {
    const pending: StyleMemoryDetail = {
      ...VERIFIED_DETAIL,
      verificationStatus: "pending_verification",
      representativeGenerationTaskId: null,
      representativeResult: null,
      usage: { lastUsedAt: null, derivedIterationCount: 0 },
    };
    render(
      <StyleMemoryDetailView detail={pending} onSelectRepresentative={() => undefined} />,
    );

    const evidence = screen.getByTestId("style-memory-detail-evidence");
    expect(
      within(evidence).getByText(/从相关的已完成 Iteration 选择代表结果/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /选择代表结果/ })).toBeInTheDocument();
    // 参考图保留；代表结果图不渲染
    expect(
      within(evidence).getByRole("img", { name: "Editorial Soft Daylight 的参考图" }),
    ).toBeInTheDocument();
    expect(
      within(evidence).queryByRole("img", { name: /代表结果/ }),
    ).not.toBeInTheDocument();

    // 已验证入口（替换）不出现
    expect(
      screen.queryByRole("button", { name: /替换代表结果/ }),
    ).not.toBeInTheDocument();

    // 使用情况：尚未使用 + 派生 0 次
    const usage = screen.getByTestId("style-memory-detail-usage");
    expect(within(usage).getByText(/尚未使用/)).toBeInTheDocument();
    expect(within(usage).getByText(/派生.*0.*次/)).toBeInTheDocument();
  });

  it("旧资产缺失分区原位标注：不渲染占位图、其余分区继续可用（AC-09）", () => {
    render(
      <StyleMemoryDetailView detail={LEGACY_DETAIL} onSelectRepresentative={() => undefined} />,
    );

    // 验证依据：参考图与来源 Iteration 均缺失 → 原位说明，无 img
    const evidence = screen.getByTestId("style-memory-detail-evidence");
    expect(within(evidence).queryByRole("img")).not.toBeInTheDocument();
    expect(within(evidence).getAllByText(/来源缺失|待补充/).length).toBeGreaterThan(0);
    expect(within(evidence).queryByRole("link", { name: /打开/ })).not.toBeInTheDocument();

    // 保留的风格：规则与风格指纹为空 → 待补充
    const style = screen.getByTestId("style-memory-detail-style");
    expect(within(style).getAllByText(/待补充|来源缺失/).length).toBeGreaterThan(0);

    // 其余分区可用：变量（空默认值必填）+ 使用情况
    const variables = screen.getByTestId("style-memory-detail-variables");
    expect(within(variables).getByText("必填")).toBeInTheDocument();
    const usage = screen.getByTestId("style-memory-detail-usage");
    expect(within(usage).getByText(/尚未使用/)).toBeInTheDocument();
    expect(within(usage).getByText(/派生.*1.*次/)).toBeInTheDocument();
  });
});

describe("StyleMemoryEditForm（plan-05 编辑回退提示）", () => {
  function renderForm(detail: StyleMemoryDetail = VERIFIED_DETAIL) {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <StyleMemoryEditForm detail={detail} open onClose={onClose} onSaved={onSaved} />
      </QueryClientProvider>,
    );
    return { onClose, onSaved };
  }

  it("仅修改名称：不出现回退提示，显示保持用户已验证", async () => {
    const user = userEvent.setup();
    renderForm();

    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText(/名称/));
    await user.type(within(dialog).getByLabelText(/名称/), "Editorial Soft Daylight v2");

    expect(within(dialog).queryByText(/保存后.*待验证/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/保持.*已验证/)).toBeInTheDocument();
  });

  it("修改核心保留规则：出现「保存后…待验证」回退提示", async () => {
    const user = userEvent.setup();
    renderForm();

    const dialog = screen.getByRole("dialog");
    const firstRuleInput = within(dialog).getAllByLabelText(/核心保留规则|保留规则/)[0];
    await user.clear(firstRuleInput);
    await user.type(firstRuleInput, "构图改为三分法并保留呼吸感");

    expect(within(dialog).getByText(/保存后.*待验证/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/保持.*已验证/)).not.toBeInTheDocument();
  });

  it("仅调整规则顺序（集合无实质变化）：不触发回退提示", async () => {
    const user = userEvent.setup();
    renderForm();

    const dialog = screen.getByRole("dialog");
    const ruleInputs = within(dialog).getAllByLabelText(/核心保留规则|保留规则/);
    // 交换两条规则内容（顺序互换，集合不变）
    const [first, second] = ruleInputs;
    await user.clear(first);
    await user.type(first, "材质保留细颗粒与纸张感");
    await user.clear(second);
    await user.type(second, "光线柔和、无硬阴影");

    expect(within(dialog).queryByText(/保存后.*待验证/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/保持.*已验证/)).toBeInTheDocument();
  });

  it("名称为空时提交显示错误并保留表单；取消不发请求恢复展示态", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: VERIFIED_DETAIL.id }), { status: 200 }),
    );
    const { onClose, onSaved } = renderForm();

    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText(/名称/));
    // 输入前不显示错误（中性帮助文案常驻，错误仅提交/失焦后出现）
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^保存/ }));

    expect(within(dialog).getByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "取消", exact: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("待验证 Memory 编辑不显示「保持用户已验证」类提示", () => {
    renderForm(LEGACY_DETAIL);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/保持.*已验证/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/保存后.*待验证/)).not.toBeInTheDocument();
  });
});
