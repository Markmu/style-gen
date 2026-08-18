// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IterationListItemRow } from "@/components/iterations/iteration-list-item";
import { IterationNoMatchFace } from "@/components/iterations/iteration-state-faces";
import type { IterationListItem } from "@/types/models";

function buildItem(
  overrides: Partial<IterationListItem> = {},
): IterationListItem {
  return {
    id: "iter-001",
    status: "completed",
    promptSummary: "Neon cityscape at dusk",
    resultFileUrl: "https://cdn.example.com/generated/iter-001/result.webp",
    params: { aspectRatio: "16:9", quality: "hd" },
    createdAt: "2024-03-03T09:00:00.000Z",
    ...overrides,
  };
}

describe("IterationListItemRow", () => {
  it("renders a real result preview for completed iterations", () => {
    render(<IterationListItemRow item={buildItem()} />);

    const item = screen.getByTestId("iteration-list-item");
    expect(item).toHaveAttribute("data-status", "completed");
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated/iter-001/result.webp",
    );
    expect(item).toHaveTextContent("Neon cityscape at dusk");
    expect(item).toHaveTextContent("16:9 · hd");
    expect(item).toHaveTextContent("Completed");
    expect(item).toHaveTextContent("Mar 3, 2024, 09:00 UTC");
  });

  it("renders an in-progress state face without any image for processing iterations", () => {
    render(
      <IterationListItemRow
        item={buildItem({
          id: "iter-processing",
          status: "processing",
          promptSummary: "Watercolor petals study",
          resultFileUrl: null,
        })}
      />,
    );

    const item = screen.getByTestId("iteration-list-item");
    expect(item).toHaveAttribute("data-status", "processing");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(item).toHaveTextContent(/processing|in progress/i);
    expect(item).toHaveTextContent("Watercolor petals study");
    expect(item).toHaveTextContent("Processing");
  });

  it("renders a failed state face without any image for failed iterations", () => {
    render(
      <IterationListItemRow
        item={buildItem({
          id: "iter-failed",
          status: "failed",
          promptSummary: "Neon cityscape retry attempt",
          resultFileUrl: null,
        })}
      />,
    );

    const item = screen.getByTestId("iteration-list-item");
    expect(item).toHaveAttribute("data-status", "failed");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(item).toHaveTextContent(/failed|error/i);
    expect(item).toHaveTextContent("Neon cityscape retry attempt");
    expect(item).toHaveTextContent("Failed");
  });

  it("degrades a broken preview to a placeholder without losing item info", () => {
    render(<IterationListItemRow item={buildItem()} />);

    fireEvent.error(screen.getByRole("img"));

    const item = screen.getByTestId("iteration-list-item");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(item).toHaveTextContent(/preview unavailable/i);
    expect(item).toHaveTextContent("Neon cityscape at dusk");
    expect(item).toHaveTextContent("16:9 · hd");
    expect(item).toHaveTextContent("Completed");
  });

  it("shows the placeholder immediately when a completed record has no result URL", () => {
    render(<IterationListItemRow item={buildItem({ resultFileUrl: null })} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("iteration-list-item")).toHaveTextContent(
      /preview unavailable/i,
    );
  });

  it("reports selection through aria-pressed and forwards the item id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <IterationListItemRow item={buildItem()} onSelect={onSelect} />,
    );

    await user.click(screen.getByTestId("iteration-list-item"));
    expect(onSelect).toHaveBeenCalledWith("iter-001");

    rerender(
      <IterationListItemRow item={buildItem()} selected onSelect={onSelect} />,
    );
    expect(screen.getByTestId("iteration-list-item")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("IterationNoMatchFace", () => {
  it("keeps the conditions visible and offers clear/switch actions", async () => {
    const user = userEvent.setup();
    const onClearSearch = vi.fn();
    const onSwitchFilter = vi.fn();

    render(
      <IterationNoMatchFace
        onClearSearch={onClearSearch}
        onSwitchFilter={onSwitchFilter}
      />,
    );

    const face = screen.getByTestId("iteration-state-face");
    expect(face).toHaveAttribute("data-face", "no-match");
    expect(face).toHaveTextContent("No iterations match this search");
    // 三段式：发生了什么 / 保留了什么 / 下一步
    expect(face).toHaveTextContent(/no record matches/i);
    expect(face).toHaveTextContent(/stay exactly as they are/i);
    expect(face).toHaveTextContent(/clear the search or switch to all statuses/i);

    await user.click(screen.getByRole("button", { name: /clear search/i }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: /switch to all statuses/i }),
    );
    expect(onSwitchFilter).toHaveBeenCalledTimes(1);
  });
});
