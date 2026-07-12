// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateSaveDialog } from "@/components/workspace/template-save-dialog";

describe("TemplateSaveDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("constrains the dialog height and renders variables in the editor-style grid", () => {
    render(
      <TemplateSaveDialog
        open
        initialContent="Create {{subject}} inside {{scene}}."
        initialVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
          { name: "scene", defaultValue: "neon garden", label: "Scene", sourceField: "scene" },
        ]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Save as Template" });
    expect(dialog).toHaveClass("max-h-[calc(100vh-2rem)]", "overflow-hidden", "max-w-4xl");

    expect(screen.getByTestId("template-save-variable-grid")).toHaveClass("sm:grid-cols-2");
    expect(screen.getByText("Subject")).toBeInTheDocument();
    expect(screen.getByText("scene")).toBeInTheDocument();
    expect(screen.getByLabelText("Detected variable subject")).toHaveValue("glass fox");
    expect(screen.getByLabelText("Detected variable scene")).toHaveValue("neon garden");
  });

  it("submits initial variables and source image metadata", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      status: 201,
      json: async () => ({
        id: "template-1",
        name: "Saved",
        content: "Create {{subject}}.",
        variables: [{ name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" }],
      }),
    } as Response);

    render(
      <TemplateSaveDialog
        open
        initialContent="Create {{subject}}."
        initialVariables={[
          { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
        ]}
        sourceAnalysisTaskId="analysis-1"
        sourceAssetId="asset-1"
        sourceImageUrl="https://cdn.example.com/reference.png"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Template Name"), "Saved");
    await user.click(screen.getByRole("button", { name: "Save Template" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.sourceAnalysisTaskId).toBe("analysis-1");
    expect(body.sourceAssetId).toBe("asset-1");
    expect(body.sourceImageUrl).toBe("https://cdn.example.com/reference.png");
    expect(body.variables).toEqual([
      { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
    ]);
  });

  it("inserts Chinese, spaced, and hyphenated variable names", async () => {
    const user = userEvent.setup();

    render(
      <TemplateSaveDialog
        open
        initialContent="Create a prompt."
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Insert Variable/ }));
    await user.type(screen.getByPlaceholderText("Variable name"), "主体 名称-1");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.getByLabelText("Prompt Content")).toHaveValue(
      "{{主体 名称-1}}Create a prompt.",
    );
  });
});
