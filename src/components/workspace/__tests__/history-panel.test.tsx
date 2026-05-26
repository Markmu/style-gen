// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryPanel } from "@/components/workspace/history-panel";
import { useHistoryList } from "@/hooks/use-history-list";

vi.mock("@/hooks/use-history-list", () => ({
  useHistoryList: vi.fn(),
}));

const mockUseHistoryList = vi.mocked(useHistoryList);

const defaultHistoryResult = {
  data: [
    {
      id: "history-1",
      resultFileUrl: "https://cdn.example.com/result-1.png",
      createdAt: new Date().toISOString(),
    },
  ],
  isLoading: false,
  isError: false,
  error: null,
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  refetch: vi.fn(),
};

describe("HistoryPanel", () => {
  beforeEach(() => {
    mockUseHistoryList.mockReturnValue(defaultHistoryResult);

    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders as an inline history strip instead of a right drawer", () => {
    const { container } = render(<HistoryPanel />);

    expect(mockUseHistoryList).toHaveBeenCalledWith(true);
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.getByTestId("generation-history-strip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand history" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Collapse history" })).not.toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass("w-10");
    expect(container.firstElementChild).not.toHaveClass("w-72");
  });

  it("shows empty and error states inside the strip", () => {
    const refetch = vi.fn();

    mockUseHistoryList.mockReturnValueOnce({
      ...defaultHistoryResult,
      data: [],
      refetch,
    });
    const { rerender } = render(<HistoryPanel />);
    expect(screen.getByText("No generations yet")).toBeInTheDocument();

    mockUseHistoryList.mockReturnValueOnce({
      ...defaultHistoryResult,
      data: undefined,
      isError: true,
      refetch,
    });
    rerender(<HistoryPanel />);
    expect(screen.getByText("Loading failed")).toBeInTheDocument();
  });

  it("clicking a thumbnail restores that generation", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();

    render(<HistoryPanel onRestore={onRestore} />);

    expect(screen.queryByText(/Just now|m ago|h ago|d ago/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore generation" }));

    expect(onRestore).toHaveBeenCalledWith("history-1");
  });

  it("shows the current generation marker while generating", () => {
    render(<HistoryPanel currentGenerationTaskId="generating-task" />);

    expect(screen.getByTestId("history-current-generation")).toHaveTextContent(
      "Generating",
    );
  });
});
