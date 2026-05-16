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

  it("默认收起且不展示历史记录内容", () => {
    const { container } = render(<HistoryPanel />);

    expect(mockUseHistoryList).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("heading", { name: "History" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开历史记录" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("刚刚")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("w-10");
    expect(container.firstElementChild).not.toHaveClass("absolute");
    expect(screen.getByRole("button", { name: "展开历史记录" })).not.toHaveClass(
      "rounded-r-none",
    );
    expect(container.querySelector(".h-full.w-10")).toBeInTheDocument();
  });

  it("支持抽屉式收起和展开", async () => {
    const user = userEvent.setup();
    const { container } = render(<HistoryPanel />);

    await user.click(screen.getByRole("button", { name: "展开历史记录" }));

    expect(mockUseHistoryList).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("w-72");

    await user.click(screen.getByRole("button", { name: "收起历史记录" }));

    expect(screen.queryByRole("heading", { name: "History" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "展开历史记录" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(container.firstElementChild).toHaveClass("w-10");
  });

  it("点击历史缩略图触发恢复回调", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    render(<HistoryPanel onRestore={onRestore} />);

    await user.click(screen.getByRole("button", { name: "展开历史记录" }));
    await user.click(screen.getByRole("button", { name: /刚刚|分钟前/ }));

    expect(onRestore).toHaveBeenCalledWith("history-1");
  });
});
