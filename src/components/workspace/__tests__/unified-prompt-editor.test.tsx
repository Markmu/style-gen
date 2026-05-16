// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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

    expect(screen.getByLabelText("完整生成提示")).toHaveValue("initial prompt");
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

    expect(screen.getByLabelText("模板原文")).toHaveValue(
      "Create {{subject}} in {{lighting}}.",
    );

    await user.type(screen.getByLabelText("变量 subject"), "glass chair");
    await user.type(screen.getByLabelText("变量 lighting"), "soft daylight");
    await user.click(screen.getByRole("button", { name: "文本模式" }));

    expect(screen.getByLabelText("完整生成提示")).toHaveValue(
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

    expect(screen.getByLabelText("变量 subject")).toHaveValue("glass fox");
    expect(screen.getByLabelText("变量 scene")).toHaveValue("neon garden");
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

    await user.click(screen.getByRole("button", { name: "文本模式" }));
    await user.clear(screen.getByLabelText("完整生成提示"));
    await user.type(screen.getByLabelText("完整生成提示"), "manual draft");

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

    expect(screen.getByLabelText("变量 subject")).toHaveValue("crystal heron");
  });

  it("preserves manual text draft when switching back from template mode", async () => {
    const user = userEvent.setup();

    render(
      <UnifiedPromptEditor
        initialPromptText="first prompt"
        onResolvedPromptChange={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("完整生成提示"));
    await user.type(screen.getByLabelText("完整生成提示"), "manual draft");
    await user.click(screen.getByRole("button", { name: "模板模式" }));
    await user.clear(screen.getByLabelText("模板原文"));
    await user.type(screen.getByLabelText("模板原文"), "Template {{subject}}");
    await user.click(screen.getByRole("button", { name: "文本模式" }));

    expect(screen.getByLabelText("完整生成提示")).toHaveValue("manual draft");
  });

  it("saves the current text draft when saving from text mode", async () => {
    const user = userEvent.setup();
    const onTemplateContentChange = vi.fn();
    const onSaveTemplate = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText=""
        initialTemplateContent="Create {{var1}} with {{var2}}."
        onResolvedPromptChange={vi.fn()}
        onTemplateContentChange={onTemplateContentChange}
        onSaveTemplate={onSaveTemplate}
      />,
    );

    await user.type(screen.getByLabelText("变量 var1"), "glass chair");
    await user.type(screen.getByLabelText("变量 var2"), "rim light");
    await user.click(screen.getByRole("button", { name: "文本模式" }));

    expect(screen.getByLabelText("完整生成提示")).toHaveValue(
      "Create glass chair with rim light.",
    );
    expect(onTemplateContentChange).toHaveBeenLastCalledWith(
      "Create {{var1}} with {{var2}}.",
    );

    await user.click(screen.getByRole("button", { name: "保存为模板" }));

    expect(onSaveTemplate).toHaveBeenCalledWith(
      "Create glass chair with rim light.",
    );
  });

  it("saves edited fallback text instead of stale template source", () => {
    const onSaveTemplate = vi.fn();

    render(
      <UnifiedPromptEditor
        initialPromptText="Fallback full prompt"
        templateStatus="fallback"
        templateReason="No stable variables"
        onResolvedPromptChange={vi.fn()}
        onSaveTemplate={onSaveTemplate}
      />,
    );

    fireEvent.change(screen.getByLabelText("完整生成提示"), {
      target: { value: "Edited fallback prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存为模板" }));

    expect(onSaveTemplate).toHaveBeenCalledWith("Edited fallback prompt");
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

    expect(screen.getByLabelText("完整生成提示")).toHaveValue("Fallback full prompt");
    expect(screen.queryByLabelText("模板原文")).not.toBeInTheDocument();
    expect(screen.getByText("本次没有识别到足够稳定的可替换变量")).toBeVisible();
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

    expect(screen.getByLabelText("完整生成提示")).toHaveValue(
      "history restored prompt",
    );
  });
});
