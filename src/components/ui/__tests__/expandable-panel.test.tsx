// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ExpandablePanel } from "@/components/ui/expandable-panel";

function ExpandablePanelHarness() {
  const [expanded, setExpanded] = useState(false);

  return (
    <ExpandablePanel
      expanded={expanded}
      labelledBy="expandable-panel-title"
      testId="expandable-panel"
      onClose={() => setExpanded(false)}
    >
      <section>
        <h2 id="expandable-panel-title">Expanded content</h2>
        <button
          type="button"
          data-expand-toggle="true"
          aria-label={expanded ? "Close expanded content" : "Expand content"}
          onClick={() => setExpanded((value) => !value)}
        >
          Toggle
        </button>
        <button type="button">Last action</button>
      </section>
    </ExpandablePanel>
  );
}

describe("ExpandablePanel", () => {
  it("locks scroll, traps focus, closes from the backdrop, and restores focus", () => {
    document.body.style.overflow = "auto";
    render(<ExpandablePanelHarness />);

    const expandButton = screen.getByRole("button", { name: "Expand content" });
    expandButton.focus();
    fireEvent.click(expandButton);

    const dialog = screen.getByRole("dialog", { name: "Expanded content" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "Close expanded content" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("button", { name: "Close expanded content" }), {
      key: "Tab",
      shiftKey: true,
    });
    expect(screen.getByRole("button", { name: "Last action" })).toHaveFocus();

    fireEvent.mouseDown(screen.getByTestId("expandable-panel-backdrop"));

    expect(screen.queryByRole("dialog", { name: "Expanded content" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("auto");
    expect(expandButton).toHaveFocus();
  });

  it("closes with Escape", () => {
    render(<ExpandablePanelHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Expand content" }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Expanded content" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog", { name: "Expanded content" })).not.toBeInTheDocument();
  });
});
