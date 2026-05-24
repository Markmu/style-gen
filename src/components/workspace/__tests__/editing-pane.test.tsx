// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { EditingPane } from "@/components/workspace/editing-pane";

vi.mock("@/components/workspace/unified-prompt-editor", () => ({
  UnifiedPromptEditor: () => <div data-testid="unified-prompt-editor" />,
}));

describe("EditingPane", () => {
  it("renders only the prompt editor surface", () => {
    render(
      <EditingPane
        promptText="ready prompt"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("editing-pane")).toBeInTheDocument();
    expect(screen.getByTestId("unified-prompt-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("floating-generate-window")).not.toBeInTheDocument();
    expect(screen.queryByTestId("light-generate-panel")).not.toBeInTheDocument();
  });
});
