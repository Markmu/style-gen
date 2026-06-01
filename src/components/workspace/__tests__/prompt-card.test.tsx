// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptCard } from "@/components/workspace/prompt-card";

describe("PromptCard", () => {
  it("keeps a single outer save button and saves template source with variables", async () => {
    const user = userEvent.setup();
    const onSaveTemplate = vi.fn();
    const onTemplateVariablesChange = vi.fn();

    render(
      <PromptCard
        state="analysis_ready"
        promptText="Create glass fox inside neon garden."
        templateContent="Create {{subject}} inside {{scene}}."
        templateVariables={[
          {
            name: "subject",
            defaultValue: "glass fox",
            label: "Subject",
            sourceField: "subject",
          },
          {
            name: "scene",
            defaultValue: "neon garden",
            label: "Scene",
            sourceField: "scene",
          },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
        onTemplateVariablesChange={onTemplateVariablesChange}
        onSaveTemplate={onSaveTemplate}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "Save as Template" }),
    ).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Save as Template" }));

    expect(onSaveTemplate).toHaveBeenCalledWith(
      "Create {{subject}} inside {{scene}}.",
    );
    await waitFor(() =>
      expect(onTemplateVariablesChange).toHaveBeenLastCalledWith([
        {
          name: "subject",
          defaultValue: "glass fox",
          label: "Subject",
          sourceField: "subject",
        },
        {
          name: "scene",
          defaultValue: "neon garden",
          label: "Scene",
          sourceField: "scene",
        },
      ]),
    );
  });

  it("uses the outer save button for the current text mode draft", async () => {
    const user = userEvent.setup();
    const onSaveTemplate = vi.fn();

    render(
      <PromptCard
        state="analysis_ready"
        promptText="Initial prompt"
        onResolvedPromptChange={vi.fn()}
        onSaveTemplate={onSaveTemplate}
      />,
    );

    await user.clear(screen.getByLabelText("Full Generation Prompt"));
    await user.type(screen.getByLabelText("Full Generation Prompt"), "Manual draft prompt");
    await user.click(screen.getByRole("button", { name: "Save as Template" }));

    expect(onSaveTemplate).toHaveBeenCalledWith("Manual draft prompt");
  });

  it("does not reset edited template source when the resolved prompt changes", async () => {
    const user = userEvent.setup();
    const onSaveTemplate = vi.fn();
    const baseProps = {
      state: "analysis_ready" as const,
      templateContent: "Create {{subject}} inside {{scene}}.",
      templateVariables: [
        { name: "subject", defaultValue: "glass fox" },
        { name: "scene", defaultValue: "neon garden" },
      ],
      templateStatus: "ready" as const,
      templateKey: "analysis-1",
      onResolvedPromptChange: vi.fn(),
      onSaveTemplate,
    };

    const { rerender } = render(
      <PromptCard
        {...baseProps}
        promptText="Create glass fox inside neon garden."
      />,
    );

    fireEvent.change(screen.getByLabelText("Template Source"), {
      target: { value: "Paint {{subject}}." },
    });

    rerender(
      <PromptCard
        {...baseProps}
        promptText="Paint crystal fox."
      />,
    );
    await user.click(screen.getByRole("button", { name: "Save as Template" }));

    expect(onSaveTemplate).toHaveBeenCalledWith("Paint {{subject}}.");
  });
});
