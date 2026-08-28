// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateSaveDialog } from "@/components/workspace/template-save-dialog";
import type { TemplateVariable } from "@/types/models";

/**
 * plan-06 流程 B: 工作区草稿保存向导组件测试。
 *
 * 覆盖：首屏无代表结果说明（固定 pending verification 预期）、{{var}} 并入变量预填、
 * 提交体携带既有来源字段（sourceAnalysisTaskId / sourceAssetId /
 * sourceImageUrl）且不带 representative / sourceGenerationTask。
 */

const routerPushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

const VARIABLES: TemplateVariable[] = [
  { name: "subject", defaultValue: "glass fox", label: "Subject", sourceField: "subject" },
];

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("TemplateSaveDialog — plan-06 草稿保存向导（流程 B）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    routerPushMock.mockClear();
  });

  it("first screen is rule confirmation (no representative checkbox) + pending note + editable variable defaults", async () => {
    const user = userEvent.setup();
    render(
      <TemplateSaveDialog
        open
        initialContent="Create {{subject}} in a neon garden."
        initialVariables={VARIABLES}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByTestId("save-style-memory-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");

    const note = screen.getByTestId("save-wizard-no-representative-note");
    expect(note).toHaveTextContent(/No representative result yet/);
    expect(note).toHaveTextContent(/Pending verification/);
    // 无步骤 1 与代表结果勾选（流程 B 跳过）
    expect(within(dialog).queryByTestId("save-wizard-step-1")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /Set as representative result/ }),
    ).not.toBeInTheDocument();

    // {{var}} 并入变量预填：默认值同屏可编辑
    const step2 = screen.getByTestId("save-wizard-step-2");
    const subject = within(step2).getByLabelText(/subject/i);
    expect(subject).toHaveValue("glass fox");
    await user.clear(subject);
    await user.type(subject, "brushed steel fox");
    expect(subject).toHaveValue("brushed steel fox");
  });

  it("提交体携带来源资产/分析任务/来源图，不带 representative 与 sourceGenerationTask", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "template-1", name: "Saved" }),
    );
    vi.spyOn(global, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
    const user = userEvent.setup();

    render(
      <TemplateSaveDialog
        open
        initialContent="Create {{subject}}."
        initialVariables={VARIABLES}
        sourceAnalysisTaskId="analysis-1"
        sourceAssetId="asset-1"
        sourceImageUrl="https://cdn.example.com/reference.png"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.type(screen.getByLabelText(/^Name$/), "Saved");
    await user.click(screen.getByRole("button", { name: /^Save/ }));

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith("/workspace/templates/template-1"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      String(fetchMock.mock.calls[0][1].body),
    ) as Record<string, unknown>;
    expect(body.sourceAnalysisTaskId).toBe("analysis-1");
    expect(body.sourceAssetId).toBe("asset-1");
    expect(body.sourceImageUrl).toBe("https://cdn.example.com/reference.png");
    expect(body.representativeGenerationTaskId).toBeUndefined();
    expect(body.sourceGenerationTaskId).toBeUndefined();
    expect(body.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "subject", defaultValue: "glass fox" }),
      ]),
    );
  });

  it("open=false 时不渲染", () => {
    render(
      <TemplateSaveDialog
        open={false}
        initialContent="Create {{subject}}."
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("save-style-memory-dialog"),
    ).not.toBeInTheDocument();
  });
});
