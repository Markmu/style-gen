// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateSaveDialog } from "@/components/workspace/template-save-dialog";

describe("TemplateSaveDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("submits initial variables and sourceAnalysisTaskId", async () => {
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
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("模板名称"), "Saved");
    await user.click(screen.getByRole("button", { name: "保存模板" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.sourceAnalysisTaskId).toBe("analysis-1");
    expect(body.variables).toEqual([
      { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
    ]);
  });
});
