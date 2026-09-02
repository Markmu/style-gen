// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  KeepChangeSummary,
  type KeepChangeChangeItem,
  type KeepChangeKeepItem,
  type KeepChangeLocateTarget,
} from "@/components/workspace/keep-change-summary";

const keepItems: KeepChangeKeepItem[] = [
  { invariantId: "color_invariant_1", value: "warm amber and sand palette", dimension: "color" },
  { invariantId: "lighting_invariant_1", value: "soft directional window light", dimension: "lighting" },
];

const changeItems: KeepChangeChangeItem[] = [
  {
    variableName: "subject",
    label: "Subject",
    value: "ceramic vase",
    defaultValue: "amber bottle",
  },
];

function renderSummary(overrides: Partial<Parameters<typeof KeepChangeSummary>[0]> = {}) {
  const onLocate = vi.fn();
  const props = {
    intent: "same_style" as const,
    keepItems,
    changeItems,
    onLocate: (target: KeepChangeLocateTarget) => onLocate(target),
    ...overrides,
  };
  render(<KeepChangeSummary {...props} />);
  return { onLocate };
}

describe("KeepChangeSummary", () => {
  it("derives rows from real invariants and variables with traceable ids", () => {
    renderSummary();

    const container = screen.getByTestId("keep-change-summary");
    expect(container).toHaveAttribute("data-intent", "same_style");

    const keepRows = screen.getAllByTestId("keep-change-item").filter(
      (item) => item.getAttribute("data-kind") === "keep",
    );
    expect(keepRows).toHaveLength(2);
    expect(keepRows[0]).toHaveAttribute("data-target-id", "color_invariant_1");
    expect(keepRows[0]).toHaveTextContent("warm amber and sand palette");

    const changeRows = screen.getAllByTestId("keep-change-item").filter(
      (item) => item.getAttribute("data-kind") === "change",
    );
    expect(changeRows).toHaveLength(1);
    expect(changeRows[0]).toHaveAttribute("data-target-id", "subject");
    expect(changeRows[0]).toHaveTextContent("Subject");
  });

  it("shows the reconstruction intent note only for reconstruction", () => {
    const { rerender } = render(
      <KeepChangeSummary
        intent="reconstruction"
        keepItems={keepItems}
        changeItems={[]}
        onLocate={vi.fn()}
      />,
    );
    expect(screen.getByTestId("keep-change-intent-note")).toBeVisible();
    expect(screen.getByTestId("keep-change-intent-note")).toHaveTextContent(
      /同时参考原内容与风格/,
    );

    rerender(
      <KeepChangeSummary
        intent="same_style"
        keepItems={keepItems}
        changeItems={[]}
        onLocate={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("keep-change-intent-note")).not.toBeInTheDocument();
  });

  it("shows a recoverable empty state without faking rows when sources are missing", () => {
    renderSummary({ keepItems: [], changeItems: [] });

    expect(screen.getByTestId("keep-change-empty")).toBeVisible();
    expect(screen.queryAllByTestId("keep-change-item")).toHaveLength(0);
  });

  it("locates the real rule for keep items and the variable editor for change items", async () => {
    const user = userEvent.setup();
    const { onLocate } = renderSummary();

    await user.click(
      screen
        .getAllByTestId("keep-change-item")
        .filter((item) => item.getAttribute("data-target-id") === "color_invariant_1")[0],
    );
    expect(onLocate).toHaveBeenCalledWith({
      kind: "keep",
      invariantId: "color_invariant_1",
    });

    await user.click(
      screen
        .getAllByTestId("keep-change-item")
        .filter((item) => item.getAttribute("data-kind") === "change")[0],
    );
    expect(onLocate).toHaveBeenCalledWith({
      kind: "change",
      variableName: "subject",
    });
  });

  it("announces updates through a polite live region without moving focus", () => {
    const outside = document.createElement("button");
    outside.type = "button";
    outside.textContent = "Outside trigger";
    document.body.appendChild(outside);
    outside.focus();

    const { rerender } = render(
      <KeepChangeSummary
        intent="same_style"
        keepItems={keepItems}
        changeItems={[]}
        onLocate={vi.fn()}
      />,
    );

    rerender(
      <KeepChangeSummary
        intent="same_style"
        keepItems={keepItems}
        changeItems={[]}
        highlightedTargetId="color_invariant_1"
        announcement="Rule adjustment applied: color_invariant_1"
        onLocate={vi.fn()}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Rule adjustment applied: color_invariant_1");
    // polite 通知不夺走正在编辑的焦点
    expect(outside).toHaveFocus();

    const highlighted = screen
      .getAllByTestId("keep-change-item")
      .filter((item) => item.getAttribute("data-target-id") === "color_invariant_1")[0];
    expect(highlighted).toHaveClass("bg-[var(--accent-primary-soft)]");
    document.body.removeChild(outside);
  });
});
