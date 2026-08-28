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

describe("StyleMemoryDetailView (plan-05 four-section view)", () => {
  it("renders four sections + usage; full prompt collapsed and invisible by default", () => {
    render(
      <StyleMemoryDetailView detail={VERIFIED_DETAIL} onSelectRepresentative={() => undefined} />,
    );

    // Evidence: reference + representative result side by side + captions + source iteration link (focus targeting)
    const evidence = screen.getByTestId("style-memory-detail-evidence");
    expect(within(evidence).getByText("Reference")).toBeInTheDocument();
    expect(within(evidence).getByText("Representative result")).toBeInTheDocument();
    expect(
      within(evidence).getByRole("img", { name: "Reference for Editorial Soft Daylight" }),
    ).toBeInTheDocument();
    expect(
      within(evidence).getByRole("img", { name: "Representative result for Editorial Soft Daylight" }),
    ).toBeInTheDocument();
    const sourceLink = within(evidence).getByRole("link", { name: /Open/ });
    expect(sourceLink).toHaveAttribute("href", "/workspace/iterations?focus=gen-source-01");

    // Retained style: style fingerprint + retained rules
    const style = screen.getByTestId("style-memory-detail-style");
    expect(within(style).getByText("Retained style")).toBeInTheDocument();
    expect(within(style).getByText("低饱和暖灰")).toBeInTheDocument();
    expect(within(style).getByText("光线柔和、无硬阴影")).toBeInTheDocument();

    // Replaceable: defaults per variable + empty default marked Required
    const variables = screen.getByTestId("style-memory-detail-variables");
    expect(within(variables).getByText("Replaceable")).toBeInTheDocument();
    expect(within(variables).getByText("玻璃器皿")).toBeInTheDocument();
    expect(within(variables).getByText("Required")).toBeInTheDocument();

    // Constraints & enhancements
    const constraints = screen.getByTestId("style-memory-detail-constraints");
    expect(within(constraints).getByText("避免高饱和霓虹色")).toBeInTheDocument();
    expect(within(constraints).getByText("编辑式排版留白")).toBeInTheDocument();

    // Full prompt invisible by default (advanced section collapsed)
    expect(screen.queryByText(/fine grain texture/)).not.toBeInTheDocument();

    // Usage: last used (with year) + derived count
    const usage = screen.getByTestId("style-memory-detail-usage");
    expect(within(usage).getByText(/Last used/)).toBeInTheDocument();
    expect(within(usage).getByText(/2026/)).toBeInTheDocument();
    expect(within(usage).getByText(/Derived.*3.*times/)).toBeInTheDocument();
    expect(within(usage).queryByText("Never used")).not.toBeInTheDocument();
  });

  it("full prompt becomes visible after expanding the advanced section", async () => {
    const user = userEvent.setup();
    render(
      <StyleMemoryDetailView detail={VERIFIED_DETAIL} onSelectRepresentative={() => undefined} />,
    );

    await user.click(screen.getByRole("button", { name: /full prompt/i }));

    expect(await screen.findByText(/fine grain texture/)).toBeInTheDocument();
  });

  it("pending without representative result: evidence section shows selection guidance and entry, no representative image rendered", () => {
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
      within(evidence).getByText(/Choose a representative result from a related completed iteration/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select representative result/ })).toBeInTheDocument();
    // Reference kept; representative result image not rendered
    expect(
      within(evidence).getByRole("img", { name: "Reference for Editorial Soft Daylight" }),
    ).toBeInTheDocument();
    expect(
      within(evidence).queryByRole("img", { name: /Representative result/ }),
    ).not.toBeInTheDocument();

    // Verified entry (replace) does not appear
    expect(
      screen.queryByRole("button", { name: /Replace representative result/ }),
    ).not.toBeInTheDocument();

    // Usage: Never used + derived 0 times
    const usage = screen.getByTestId("style-memory-detail-usage");
    expect(within(usage).getByText(/Never used/)).toBeInTheDocument();
    expect(within(usage).getByText(/Derived.*0.*times/)).toBeInTheDocument();
  });

  it("legacy asset missing sections are annotated in place: no placeholder images, other sections stay usable (AC-09)", () => {
    render(
      <StyleMemoryDetailView detail={LEGACY_DETAIL} onSelectRepresentative={() => undefined} />,
    );

    // Evidence: reference and source iteration both missing → in-place notes, no img
    const evidence = screen.getByTestId("style-memory-detail-evidence");
    expect(within(evidence).queryByRole("img")).not.toBeInTheDocument();
    expect(within(evidence).getAllByText(/Missing source|Not yet provided/).length).toBeGreaterThan(0);
    expect(within(evidence).queryByRole("link", { name: /Open/ })).not.toBeInTheDocument();

    // Retained style: rules and fingerprint empty → not-yet-provided notes
    const style = screen.getByTestId("style-memory-detail-style");
    expect(within(style).getAllByText(/Not yet provided|Missing source/).length).toBeGreaterThan(0);

    // Other sections usable: variables (empty default Required) + usage
    const variables = screen.getByTestId("style-memory-detail-variables");
    expect(within(variables).getByText("Required")).toBeInTheDocument();
    const usage = screen.getByTestId("style-memory-detail-usage");
    expect(within(usage).getByText(/Never used/)).toBeInTheDocument();
    expect(within(usage).getByText(/Derived.*1.*times/)).toBeInTheDocument();
  });
});

describe("StyleMemoryEditForm (plan-05 edit rollback hint)", () => {
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

  it("name-only change: no rollback hint, shows stays-User-verified hint", async () => {
    const user = userEvent.setup();
    renderForm();

    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText(/Name/));
    await user.type(within(dialog).getByLabelText(/Name/), "Editorial Soft Daylight v2");

    expect(within(dialog).queryByText(/After saving.*Pending verification/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/stays User verified/)).toBeInTheDocument();
  });

  it("retained-rule change: shows the After saving → Pending verification rollback hint", async () => {
    const user = userEvent.setup();
    renderForm();

    const dialog = screen.getByRole("dialog");
    const firstRuleInput = within(dialog).getAllByLabelText(/Retained rules/)[0];
    await user.clear(firstRuleInput);
    await user.type(firstRuleInput, "构图改为三分法并保留呼吸感");

    expect(within(dialog).getByText(/After saving.*Pending verification/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/stays User verified/)).not.toBeInTheDocument();
  });

  it("rule order-only change (no substantive set change): no rollback hint", async () => {
    const user = userEvent.setup();
    renderForm();

    const dialog = screen.getByRole("dialog");
    const ruleInputs = within(dialog).getAllByLabelText(/Retained rules/);
    // 交换两条规则内容（顺序互换，集合不变）
    const [first, second] = ruleInputs;
    await user.clear(first);
    await user.type(first, "材质保留细颗粒与纸张感");
    await user.clear(second);
    await user.type(second, "光线柔和、无硬阴影");

    expect(within(dialog).queryByText(/After saving.*Pending verification/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/stays User verified/)).toBeInTheDocument();
  });

  it("empty name on submit shows error and keeps form; cancel sends no request and restores display state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: VERIFIED_DETAIL.id }), { status: 200 }),
    );
    const { onClose, onSaved } = renderForm();

    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText(/Name/));
    // 输入前不显示错误（中性帮助文案常驻，错误仅提交/失焦后出现）
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^Save/ }));

    expect(within(dialog).getByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel", exact: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("pending memory edit shows no stays-User-verified style hint", () => {
    renderForm(LEGACY_DETAIL);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText(/stays User verified/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/After saving.*Pending verification/)).not.toBeInTheDocument();
  });
});
