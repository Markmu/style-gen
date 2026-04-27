// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatePresenter } from "@/components/ui/state-presenter";

describe("StatePresenter", () => {
  it("renders empty state copy and actions", () => {
    render(<StatePresenter status="empty" />);

    expect(screen.getByText("准备开始")).toBeInTheDocument();
    expect(screen.getByText(/添加参考图或选择模板/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "添加参考图" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "浏览模板" }),
    ).toBeInTheDocument();
  });

  it("renders processing state without forcing a modal", () => {
    const { container } = render(<StatePresenter compact status="processing" />);

    expect(screen.getByText("正在处理")).toBeInTheDocument();
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
    expect(container.querySelector("[data-status='processing']")).toBeInTheDocument();
  });

  it("renders failedRecoverable as assertive and actionable", () => {
    const { container } = render(<StatePresenter status="failedRecoverable" />);

    expect(container.querySelector("[aria-live='assertive']")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回编辑" })).toBeInTheDocument();
  });

  it("renders auth required action", () => {
    render(<StatePresenter status="authRequired" />);

    expect(screen.getByText("需要登录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("renders no results recovery copy", () => {
    render(<StatePresenter status="noResults" />);

    expect(screen.getByText("没有匹配结果")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清空搜索" })).toBeInTheDocument();
  });

  it("uses overrides and invokes actions", async () => {
    const user = userEvent.setup();
    const onPrimaryAction = vi.fn();
    const onSecondaryAction = vi.fn();

    render(
      <StatePresenter
        description="当前分析没有完成，参考图仍会保留。"
        onPrimaryAction={onPrimaryAction}
        onSecondaryAction={onSecondaryAction}
        primaryActionLabel="重试分析"
        secondaryActionLabel="更换参考图"
        status="failedRecoverable"
        title="分析失败"
      />,
    );

    await user.click(screen.getByRole("button", { name: "重试分析" }));
    await user.click(screen.getByRole("button", { name: "更换参考图" }));

    expect(screen.getByText("分析失败")).toBeInTheDocument();
    expect(screen.getByText(/参考图仍会保留/)).toBeInTheDocument();
    expect(onPrimaryAction).toHaveBeenCalledOnce();
    expect(onSecondaryAction).toHaveBeenCalledOnce();
  });
});
