// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryStrip } from "@/components/workspace/history-strip";

const items = Array.from({ length: 22 }, (_, index) => ({
  id: `history-${index + 1}`,
  resultFileUrl: `https://cdn.example.com/result-${index + 1}.webp`,
  createdAt: "2024-01-01T00:00:00.000Z",
}));

describe("HistoryStrip", () => {
  it("renders the history heading without thumbnails in empty state", () => {
    render(<HistoryStrip historyItems={[]} onSelect={vi.fn()} onViewAll={vi.fn()} />);

    expect(screen.getByTestId("history-strip")).toHaveClass("h-full");
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open history item" })).not.toBeInTheDocument();
  });

  it("limits visible thumbnails to the latest twenty items", () => {
    render(<HistoryStrip historyItems={items} onSelect={vi.fn()} onViewAll={vi.fn()} />);

    expect(screen.getAllByRole("button", { name: "Open history item" })).toHaveLength(20);
  });

  it("opens a thumbnail without marking it selected and calls view all", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onViewAll = vi.fn();

    render(
      <HistoryStrip
        historyItems={items.slice(0, 2)}
        onSelect={onSelect}
        onViewAll={onViewAll}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Open history item" })[0]);
    await user.click(screen.getByRole("button", { name: "View all" }));

    expect(onSelect).toHaveBeenCalledWith("history-1");
    expect(onViewAll).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Open history item" })[1]).not.toHaveAttribute(
      "aria-pressed",
    );
  });
});
