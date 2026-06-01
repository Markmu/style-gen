// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";

describe("UnifiedPromptEditor", () => {
  it("renders text mode from the initial prompt", () => {
    render(
      <UnifiedPromptEditor
        initialPromptText="initial prompt"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue("initial prompt");
  });

  it("renders template variables outside the template body and resolves them", async () => {
    const user = userEvent.setup();
    const onResolvedPromptChange = vi.fn();
    const onTemplateContentChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText=""
        initialTemplateContent="Create {{subject}} in {{lighting}}."
        onResolvedPromptChange={onResolvedPromptChange}
        onTemplateContentChange={onTemplateContentChange}
      />,
    );

    expect(screen.getByLabelText("Template Source")).toHaveValue(
      "Create {{subject}} in {{lighting}}.",
    );

    await user.type(screen.getByLabelText("Variable subject"), "glass chair");
    await user.type(screen.getByLabelText("Variable lighting"), "soft daylight");
    await user.click(screen.getByRole("button", { name: "Text Mode" }));

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "Create glass chair in soft daylight.",
    );
    expect(onResolvedPromptChange).toHaveBeenLastCalledWith(
      "Create glass chair in soft daylight.",
    );
    expect(onTemplateContentChange).toHaveBeenCalledWith(
      "Create {{subject}} in {{lighting}}.",
    );
  });

  it("prefills template variables from analysis defaults and emits current variables", async () => {
    const onTemplateVariablesChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText="Create glass fox."
        initialTemplateContent="Create {{subject}} inside {{scene}}."
        initialTemplateVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
          { name: "scene", defaultValue: "neon garden", label: "Scene", sourceField: "scene" },
        ]}
        templateStatus="ready"
        onResolvedPromptChange={vi.fn()}
        onTemplateVariablesChange={onTemplateVariablesChange}
      />,
    );

    expect(screen.getByLabelText("Variable subject")).toHaveValue("glass fox");
    expect(screen.getByLabelText("Variable scene")).toHaveValue("neon garden");
    expect(onTemplateVariablesChange).toHaveBeenLastCalledWith([
      { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
      { name: "scene", defaultValue: "neon garden", label: "Scene", sourceField: "scene" },
    ]);
  });

  it("resets touched text when a new analysis template arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <UnifiedPromptEditor
        initialPromptText="Create glass fox."
        initialTemplateContent="Create {{subject}}."
        initialTemplateVariables={[{ name: "subject", defaultValue: "glass fox" }]}
        templateStatus="ready"
        templateKey="analysis-1"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Text Mode" }));
    await user.clear(screen.getByLabelText("Full Generation Prompt"));
    await user.type(screen.getByLabelText("Full Generation Prompt"), "manual draft");

    rerender(
      <UnifiedPromptEditor
        initialPromptText="Create crystal heron."
        initialTemplateContent="Create {{subject}}."
        initialTemplateVariables={[{ name: "subject", defaultValue: "crystal heron" }]}
        templateStatus="ready"
        templateKey="analysis-2"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Variable subject")).toHaveValue("crystal heron");
  });

  it("preserves manual text draft when switching back from template mode", async () => {
    const user = userEvent.setup();

    render(
      <UnifiedPromptEditor
        initialPromptText="first prompt"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Full Generation Prompt"));
    await user.type(screen.getByLabelText("Full Generation Prompt"), "manual draft");
    await user.click(screen.getByRole("button", { name: "Template Mode" }));
    await user.clear(screen.getByLabelText("Template Source"));
    await user.type(screen.getByLabelText("Template Source"), "Template {{subject}}");
    await user.click(screen.getByRole("button", { name: "Text Mode" }));

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue("manual draft");
  });

  it("emits the current text draft as save content from text mode", async () => {
    const user = userEvent.setup();
    const onTemplateContentChange = vi.fn();
    const onSaveContentChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText=""
        initialTemplateContent="Create {{var1}} with {{var2}}."
        onResolvedPromptChange={vi.fn()}
        onTemplateContentChange={onTemplateContentChange}
        onSaveContentChange={onSaveContentChange}
      />,
    );

    await user.type(screen.getByLabelText("Variable var1"), "glass chair");
    await user.type(screen.getByLabelText("Variable var2"), "rim light");
    await user.click(screen.getByRole("button", { name: "Text Mode" }));

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "Create glass chair with rim light.",
    );
    expect(onTemplateContentChange).toHaveBeenLastCalledWith(
      "Create {{var1}} with {{var2}}.",
    );

    await waitFor(() =>
      expect(onSaveContentChange).toHaveBeenLastCalledWith(
        "Create glass chair with rim light.",
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Save as Template" }),
    ).not.toBeInTheDocument();
  });

  it("emits edited fallback text instead of stale template source", async () => {
    const onSaveContentChange = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText="Fallback full prompt"
        templateStatus="fallback"
        templateReason="No stable variables"
        onResolvedPromptChange={vi.fn()}
        onSaveContentChange={onSaveContentChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Full Generation Prompt"), {
      target: { value: "Edited fallback prompt" },
    });

    await waitFor(() =>
      expect(onSaveContentChange).toHaveBeenLastCalledWith(
        "Edited fallback prompt",
      ),
    );
  });

  it("renders fallback text mode even if a stale template body is present", () => {
    render(
      <UnifiedPromptEditor
        initialPromptText="Fallback full prompt"
        initialTemplateContent="Create {{subject}}."
        templateStatus="fallback"
        templateReason="No stable variables"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue("Fallback full prompt");
    expect(screen.queryByLabelText("Template Source")).not.toBeInTheDocument();
    expect(screen.getByText("No stable replaceable variables were detected this time.")).toBeVisible();
  });

  it("refreshes text draft when an external prompt replaces the current workspace context", () => {
    const onResolvedPromptChange = vi.fn();
    const { rerender } = render(
      <UnifiedPromptEditor
        initialPromptText="manual local prompt"
        onResolvedPromptChange={onResolvedPromptChange}
      />,
    );

    rerender(
      <UnifiedPromptEditor
        initialPromptText="history restored prompt"
        onResolvedPromptChange={onResolvedPromptChange}
      />,
    );

    expect(screen.getByLabelText("Full Generation Prompt")).toHaveValue(
      "history restored prompt",
    );
  });
});
