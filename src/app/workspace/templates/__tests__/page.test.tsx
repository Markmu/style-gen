// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  useTemplateSearch: vi.fn(),
  pathname: "/workspace/templates",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.searchParams,
}));

vi.mock("@/hooks/use-template-search", () => ({
  useTemplateSearch: () => mocks.useTemplateSearch(),
  parseStatusFilter: (value: string | null | undefined) =>
    value === "user_verified" || value === "pending_verification" ? value : "all",
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

import StyleMemoryPage from "../page";
import type { StyleMemoryListItem } from "@/types/models";

const memory: StyleMemoryListItem = {
  id: "memory-1",
  name: "Editorial Soft Light Memory",
  verificationStatus: "user_verified",
  retainedRulesPreview: ["柔和漫射光与半透明表面", "低饱和色调与留白构图"],
  variableCount: 2,
  sourceImageUrl: "https://cdn.example.com/reference.png",
  representativeImageUrl: "https://cdn.example.com/result.png",
  lastUsedAt: "2026-08-20T10:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

function setTemplateSearch(overrides: Record<string, unknown> = {}) {
  const setSearch = vi.fn();
  const setStatus = vi.fn();
  mocks.useTemplateSearch.mockReturnValue({
    templates: [memory],
    isLoading: false,
    isError: false,
    error: null,
    errorStatus: null,
    errorCode: null,
    isAuthRequired: false,
    isRecoverableError: false,
    search: "",
    setSearch,
    status: "all",
    setStatus,
    isSearching: false,
    ...overrides,
  });
  return { setSearch, setStatus };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StyleMemoryPage />
    </QueryClientProvider>,
  );
}

describe("StyleMemoryPage (plan-04 list page)", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.refresh.mockClear();
    mocks.replace.mockClear();
    mocks.useTemplateSearch.mockReset();
    mocks.searchParams = new URLSearchParams();
    setTemplateSearch();
  });

  it("renders populated Style Memory identity and cards", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /^Style Memory$/i })).toBeInTheDocument();
    // 搜索提示 aria 承载全量谓词口径
    expect(
      screen.getByRole("textbox", { name: /Search Style Memory by name, description, style rules/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 items")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open workspace/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Template Library$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: memory.name })).toBeInTheDocument();
    // plan-04 新卡片：验证徽标 + 代表结果主预览 + 参考图 + 真实规则摘要
    const card = screen.getByTestId("style-memory-card");
    expect(within(card).getByText("User verified")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Representative result for Editorial Soft Light Memory" }),
    ).toHaveAttribute("data-src", "https://cdn.example.com/result.png");
    expect(within(card).getByText("Reference")).toBeInTheDocument();
    expect(within(card).getByText(/柔和漫射光与半透明表面/)).toBeInTheDocument();
    expect(within(card).getByText("2 variables")).toBeInTheDocument();
    // 名称派生标签已移除（NAME_TAG_RULES / Source-backed 等）
    expect(
      screen.queryByText(/Source-backed|Prompt-only|Style tags|Reuse intent/i),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state with workspace and Iterations entries", () => {
    const { container } = renderPageWithState({
      templates: [],
      search: "",
    });

    const state = container.querySelector('section[data-status="empty"]');
    expect(state).toBeInTheDocument();
    expect(state).toHaveTextContent(/No Style Memory saved yet/i);
    expect(
      within(state as HTMLElement).getByRole("link", { name: /Open workspace/ }),
    ).toHaveAttribute("href", "/workspace");
    expect(
      within(state as HTMLElement).getByRole("link", { name: /View iterations/ }),
    ).toHaveAttribute("href", "/workspace/iterations");
    expect(
      screen.getByRole("textbox", { name: /Search Style Memory by name, description, style rules/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();
    expect(screen.queryByText(/No templates yet/i)).not.toBeInTheDocument();
  });

  it("shows noResults and clears filters without losing page context", async () => {
    const user = userEvent.setup();
    const { setSearch, setStatus, container } = renderPageWithState({
      templates: [],
      search: "brutalist neon collage",
      status: "pending_verification",
    });

    const state = container.querySelector('section[data-status="noResults"]');
    expect(state).toBeInTheDocument();
    expect(state).toHaveTextContent(/No matching Style Memory/i);
    // 说明实际搜索范围（与 aria 口径一致）
    expect(state).toHaveTextContent(/name, description, style rules/);

    await user.click(
      within(state as HTMLElement).getByRole("button", { name: /Clear search and filters/ }),
    );
    expect(setSearch).toHaveBeenCalledWith("");
    expect(setStatus).toHaveBeenCalledWith("all");
    expect(screen.getByRole("heading", { name: /^Style Memory$/i })).toBeInTheDocument();
  });

  it("maps 401 responses to authRequired", () => {
    const { container } = renderPageWithState({
      templates: undefined,
      isError: true,
      error: new Error("Authentication required"),
      errorStatus: 401,
      isAuthRequired: true,
    });

    const state = container.querySelector('section[data-status="authRequired"]');
    expect(state).toBeInTheDocument();
    expect(state).toHaveTextContent(/Sign in to view cloud Style Memory/i);
    expect(within(state as HTMLElement).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      within(state as HTMLElement).getByRole("button", { name: /Back to workspace/ }),
    ).toBeInTheDocument();
  });

  it("status filter pills switch server-side filters and can be cleared", async () => {
    const user = userEvent.setup();

    const { setStatus } = renderPageWithState({});

    expect(screen.getByText("1 items")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "All", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    // 三态互斥筛选：点击「User verified」→ setStatus(user_verified)
    await user.click(screen.getByRole("button", { name: "User verified", exact: true }));
    expect(setStatus).toHaveBeenCalledWith("user_verified");

    // 点击「Pending verification」→ setStatus(pending_verification)
    await user.click(screen.getByRole("button", { name: "Pending verification", exact: true }));
    expect(setStatus).toHaveBeenCalledWith("pending_verification");
  });

  it("Clear filters resets both search and status when filters are active", async () => {
    const user = userEvent.setup();
    const { setSearch, setStatus } = renderPageWithState({
      search: "低饱和",
      status: "pending_verification",
    });

    expect(
      screen.getByRole("button", { name: "Pending verification", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(setSearch).toHaveBeenCalledWith("");
    expect(setStatus).toHaveBeenCalledWith("all");
  });

  it("maps API failures to failedRecoverable and keeps the toolbar visible", () => {
    const { container } = renderPageWithState({
      templates: undefined,
      isError: true,
      error: new Error("Style Memory service temporarily unavailable"),
      errorStatus: 500,
      isAuthRequired: false,
      isRecoverableError: true,
    });

    const state = container.querySelector('section[data-status="failedRecoverable"]');
    expect(state).toBeInTheDocument();
    expect(state).toHaveTextContent(/Style Memory service unavailable/i);
    expect(state).toHaveTextContent(/temporarily unavailable/i);
    expect(within(state as HTMLElement).getByRole("button", { name: /Retry/ })).toBeInTheDocument();
    // 503 保留搜索/筛选可见（工具栏不被整体隐藏）
    expect(
      screen.getByRole("textbox", { name: /Search Style Memory by name, description, style rules/ }),
    ).toBeInTheDocument();
    expect(container.querySelector('section[data-status="empty"]')).not.toBeInTheDocument();
    expect(container.querySelector('section[data-status="noResults"]')).not.toBeInTheDocument();
  });
});

function renderPageWithState(overrides: Record<string, unknown>) {
  const result = setTemplateSearch(overrides);
  const rendered = renderPage();
  return { ...result, ...rendered };
}

describe("StyleMemoryPage — focus targeting (plan-05 / 架构 §6.4 步骤 4)", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.refresh.mockClear();
    mocks.replace.mockClear();
    mocks.useTemplateSearch.mockReset();
    mocks.searchParams = new URLSearchParams();
    setTemplateSearch();
  });

  it("focus=<id> hit: target card gets data-focused highlight and the param is consumed from the URL (replace)", async () => {
    mocks.searchParams = new URLSearchParams("focus=memory-1");
    renderPage();

    const card = screen.getByTestId("style-memory-card");
    await waitFor(() =>
      expect(card).toHaveAttribute("data-focused", "true"),
    );
    // 仅目标卡片被高亮
    expect(
      document.querySelectorAll(
        '[data-testid="style-memory-card"][data-focused="true"]',
      ),
    ).toHaveLength(1);
    // 参数一次性消费：replace 清除 focus，不污染历史栈
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/workspace/templates", {
        scroll: false,
      }),
    );
  });

  it("focus target not in the current list is silently ignored: no highlight, page renders normally, param still consumed", async () => {
    mocks.searchParams = new URLSearchParams("focus=missing-memory");
    renderPage();

    expect(screen.getByTestId("style-memory-card")).not.toHaveAttribute(
      "data-focused",
    );
    expect(
      screen.getByRole("heading", { name: memory.name }),
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(
      document.querySelectorAll(
        '[data-testid="style-memory-card"][data-focused="true"]',
      ),
    ).toHaveLength(0);
  });
});
