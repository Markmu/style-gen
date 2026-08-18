// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SaveStyleMemoryDialog,
  type SaveStyleMemoryDialogProps,
} from "@/components/iterations/save-style-memory-dialog";
import type { TemplateVariable } from "@/types/models";

/**
 * plan-05 Task 3: 保存为 Style Memory 对话框组件测试。
 *
 * 覆盖：预填（content=promptSnapshot、变量默认值文本可见、名称初始为空）、
 * 名称必填与 ≤50 字符校验（空名禁止提交、超长截断）、提交体
 * { name, content, variables, sourceAssetId, sourceGenerationTaskId }、
 * 201 成功回调 { id, name }、409 同名冲突沿用既有文案且已填内容保留、
 * 5xx 对话框内错误 + 重试、取消/Escape 关闭不提交。
 */

const INITIAL_CONTENT = "Neon dusk hero study with amber glass towers";
const INITIAL_VARIABLES: TemplateVariable[] = [
  { name: "subject", label: "Subject", defaultValue: "amber bottle", sourceField: "subject" },
  {
    name: "environment",
    label: "Environment",
    defaultValue: "quiet studio table",
    sourceField: "environment",
  },
];

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDialog(
  overrides: Partial<SaveStyleMemoryDialogProps> = {},
): { onSaved: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <SaveStyleMemoryDialog
      open
      initialContent={INITIAL_CONTENT}
      initialVariables={INITIAL_VARIABLES}
      sourceAssetId="asset-iter-001"
      sourceGenerationTaskId="iter-001"
      onSaved={onSaved}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSaved, onClose };
}

describe("SaveStyleMemoryDialog — 渲染契约（plan-05 / 架构 §6.4 步骤 2）", () => {
  it("open 时以 role=dialog 渲染：名称为空、内容预填 promptSnapshot、变量默认值可见", () => {
    renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    expect(dialog).toHaveAttribute("role", "dialog");

    const nameInput = within(dialog).getByRole("textbox", { name: /^name$/i });
    expect(nameInput).toHaveValue("");

    const contentInput = within(dialog).getByRole("textbox", {
      name: /prompt content/i,
    });
    expect(contentInput).toHaveValue(INITIAL_CONTENT);

    // 变量默认值文本可见（预填快照）
    expect(dialog).toHaveTextContent("Subject");
    expect(dialog).toHaveTextContent("amber bottle");
    expect(dialog).toHaveTextContent("Environment");
    expect(dialog).toHaveTextContent("quiet studio table");

    expect(
      within(dialog).getByRole("button", { name: /^save style memory$/i }),
    ).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /cancel/i })).toBeVisible();
  });

  it("open=false 时不渲染任何内容", () => {
    renderDialog({ open: false });

    expect(
      screen.queryByTestId("save-style-memory-dialog"),
    ).not.toBeInTheDocument();
  });

  it("空名禁止提交：提交按钮 disabled 且带必填行内提示，不发任何请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    const submit = within(dialog).getByRole("button", {
      name: /^save style memory$/i,
    });
    expect(submit).toBeDisabled();
    expect(dialog).toHaveTextContent(/a name is required/i);

    // disabled 按钮无法触发提交（防御：不发请求）
    await user.click(submit);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("名称 ≤ 50 字符：超长输入被截断，计数器达到上限", async () => {
    const user = userEvent.setup();
    renderDialog();

    const nameInput = screen.getByRole("textbox", { name: /^name$/i });
    const longName = "a".repeat(60);
    await user.type(nameInput, longName);

    expect(nameInput).toHaveValue("a".repeat(50));
    expect(screen.getByTestId("save-style-memory-dialog")).toHaveTextContent(
      "50/50",
    );
  });
});

describe("SaveStyleMemoryDialog — 提交契约（POST /api/templates，架构 §7.3）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("提交携带该次迭代的来源与快照：{ name, content, variables, sourceAssetId, sourceGenerationTaskId }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        id: "tpl-saved-1",
        name: "Neon Dusk Memory",
        content: INITIAL_CONTENT,
        variables: INITIAL_VARIABLES,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: /^name$/i }),
      "Neon Dusk Memory",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^save style memory$/i }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith({
      id: "tpl-saved-1",
      name: "Neon Dusk Memory",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/templates");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Neon Dusk Memory",
      content: INITIAL_CONTENT,
      variables: INITIAL_VARIABLES,
      sourceAssetId: "asset-iter-001",
      sourceGenerationTaskId: "iter-001",
    });
  });

  it("内容可编辑：修改后的 content 进入提交体", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { id: "tpl-saved-2", name: "Edited memory" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: /^name$/i }),
      "Edited memory",
    );
    const contentInput = within(dialog).getByRole("textbox", {
      name: /prompt content/i,
    });
    await user.clear(contentInput);
    await user.type(contentInput, "Revised neon direction");
    await user.click(
      within(dialog).getByRole("button", { name: /^save style memory$/i }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).content).toBe(
      "Revised neon direction",
    );
  });
});

describe("SaveStyleMemoryDialog — 失败呈现与恢复（plan-05 边界场景）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("409 同名冲突：沿用服务端冲突文案，名称与预填内容保留，不触发 onSaved", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(409, {
        error: "A template with this name already exists",
        code: "TEMPLATE_NAME_CONFLICT",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    const nameInput = within(dialog).getByRole("textbox", { name: /^name$/i });
    await user.type(nameInput, "Duplicate memory name");
    await user.click(
      within(dialog).getByRole("button", { name: /^save style memory$/i }),
    );

    await waitFor(() =>
      expect(dialog).toHaveTextContent(/already exists|conflict/i),
    );
    // 对话框保持打开，已填内容不丢失，未切换已保存态
    expect(
      screen.getByTestId("save-style-memory-dialog"),
    ).toBeInTheDocument();
    expect(nameInput).toHaveValue("Duplicate memory name");
    expect(
      within(dialog).getByRole("textbox", { name: /prompt content/i }),
    ).toHaveValue(INITIAL_CONTENT);
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("5xx 失败：对话框内错误呈现，修改名称后可重试成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(500, { error: "Internal error", retryable: true }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, { id: "tpl-retry-ok", name: "Retry name" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    const nameInput = within(dialog).getByRole("textbox", { name: /^name$/i });
    await user.type(nameInput, "First attempt");
    await user.click(
      within(dialog).getByRole("button", { name: /^save style memory$/i }),
    );

    await waitFor(() => expect(dialog).toHaveTextContent(/internal error/i));
    expect(nameInput).toHaveValue("First attempt");

    // 重试：调整名称后再次提交成功
    await user.clear(nameInput);
    await user.type(nameInput, "Retry name");
    await user.click(
      within(dialog).getByRole("button", { name: /^save style memory$/i }),
    );

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({
      id: "tpl-retry-ok",
      name: "Retry name",
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("网络异常：呈现网络错误文案，已填内容保留", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderDialog();

    const dialog = screen.getByTestId("save-style-memory-dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: /^name$/i }),
      "Network attempt",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^save style memory$/i }),
    );

    await waitFor(() => expect(dialog).toHaveTextContent(/network error/i));
    expect(
      within(dialog).getByRole("textbox", { name: /prompt content/i }),
    ).toHaveValue(INITIAL_CONTENT);
  });

  it("关闭后重新打开：重置为预填状态（名称清空、内容回快照）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(409, { error: "A template with this name already exists" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const props: SaveStyleMemoryDialogProps = {
      open: true,
      initialContent: INITIAL_CONTENT,
      initialVariables: INITIAL_VARIABLES,
      sourceAssetId: "asset-iter-001",
      sourceGenerationTaskId: "iter-001",
      onSaved: vi.fn(),
      onClose: vi.fn(),
    };
    const { rerender } = render(<SaveStyleMemoryDialog {...props} />);

    const nameInput = screen.getByRole("textbox", { name: /^name$/i });
    await user.type(nameInput, "Leftover name");
    await user.click(
      screen.getByRole("button", { name: /^save style memory$/i }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("save-style-memory-dialog")).toHaveTextContent(
        /already exists/i,
      ),
    );

    // 关闭（受控）→ 重新打开：回到预填初始态
    rerender(<SaveStyleMemoryDialog {...props} open={false} />);
    expect(screen.queryByTestId("save-style-memory-dialog")).not.toBeInTheDocument();
    rerender(<SaveStyleMemoryDialog {...props} open={true} />);

    expect(screen.getByRole("textbox", { name: /^name$/i })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: /prompt content/i })).toHaveValue(
      INITIAL_CONTENT,
    );
    expect(screen.getByTestId("save-style-memory-dialog")).toHaveTextContent(
      "amber bottle",
    );
  });
});

describe("SaveStyleMemoryDialog — 关闭交互", () => {
  it("Cancel 只触发 onClose，不发请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onSaved, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("Escape 视为取消", async () => {
    const { onClose } = renderDialog();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
