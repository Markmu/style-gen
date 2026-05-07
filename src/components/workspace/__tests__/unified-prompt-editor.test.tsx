// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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

  it("keeps save-template content sourced from template mode after switching to text mode", async () => {
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
      "Create {{var1}} with {{var2}}.",
    );
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
