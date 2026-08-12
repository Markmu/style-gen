// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  useTemplateSearch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/hooks/use-template-search", () => ({
  useTemplateSearch: () => mocks.useTemplateSearch(),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

import StyleMemoryPage from "../page";

const memory = {
  id: "memory-1",
  name: "Editorial Soft Light Memory",
  variableCount: 2,
  sourceAssetId: "asset-1",
  sourceImageUrl: "https://cdn.example.com/reference.png",
  createdAt: "2026-06-01T00:00:00.000Z",
};

function setTemplateSearch(overrides: Record<string, unknown> = {}) {
  const setSearch = vi.fn();
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
    isSearching: false,
    ...overrides,
  });
  return { setSearch };
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

describe("StyleMemoryPage", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.refresh.mockClear();
    mocks.useTemplateSearch.mockReset();
    setTemplateSearch();
  });

  it("renders populated Style Memory identity and cards", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: /^Style Memory$/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /search style memory/i })).toBeInTheDocument();
    expect(screen.getByText("1 memory")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Template Library$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: memory.name })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /reference image for editorial soft light memory/i })).toHaveAttribute(
      "data-src",
      "https://cdn.example.com/reference.png",
    );
    expect(screen.getByText("Style tags")).toBeInTheDocument();
    expect(screen.getByText("Reuse intent")).toBeInTheDocument();
  });

  it("shows the empty StatePresenter for an empty Style Memory library", () => {
    const { container } = renderPageWithState({
      templates: [],
      search: "",
    });

    const state = container.querySelector('section[data-status="empty"]');
    expect(state).toBeInTheDocument();
    expect(state).toHaveTextContent(/No Style Memory saved yet/i);
    expect(within(state as HTMLElement).getByRole("button", { name: /create from reference/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /search style memory/i })).toBeInTheDocument();
    expect(screen.getByText("0 memories")).toBeInTheDocument();
    expect(screen.queryByText(/No templates yet/i)).not.toBeInTheDocument();
  });

  it("shows noResults and clears search without losing page context", async () => {
    const user = userEvent.setup();
    const { setSearch, container } = renderPageWithState({
      templates: [],
      search: "brutalist neon collage",
    });

    const state = container.querySelector('section[data-status="noResults"]');
    expect(state).toBeInTheDocument();
    expect(state).toHaveTextContent(/No Style Memories found/i);

    await user.click(within(state as HTMLElement).getByRole("button", { name: /clear search/i }));
    expect(setSearch).toHaveBeenCalledWith("");
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
    expect(state).toHaveTextContent(/Log in to view Style Memory/i);
    expect(within(state as HTMLElement).getByRole("button", { name: /log in/i })).toBeInTheDocument();
    expect(within(state as HTMLElement).getByRole("button", { name: /back to workspace/i })).toBeInTheDocument();
  });

  it("maps API failures to failedRecoverable instead of empty or noResults", () => {
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
    expect(state).toHaveTextContent(/temporarily unavailable/i);
    expect(within(state as HTMLElement).getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(container.querySelector('section[data-status="empty"]')).not.toBeInTheDocument();
    expect(container.querySelector('section[data-status="noResults"]')).not.toBeInTheDocument();
  });
});

function renderPageWithState(overrides: Record<string, unknown>) {
  const result = setTemplateSearch(overrides);
  const rendered = renderPage();
  return { ...result, ...rendered };
}
