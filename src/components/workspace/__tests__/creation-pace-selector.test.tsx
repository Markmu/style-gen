// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CreationPaceSelector,
  type PaceGenerationSettings,
} from "@/components/workspace/creation-pace-selector";
import type {
  CreationPace,
  QuickAuthorization,
  QuickGenerationAuthorizationSnapshot,
} from "@/types/models";

const generationSettings: PaceGenerationSettings = {
  quality: "standard",
  model: "flux-2-dev",
};

interface MountOptions {
  creationPace?: CreationPace;
  quickAuthorization?: QuickAuthorization;
  settings?: PaceGenerationSettings;
  clearedReason?: string | null;
}

function mountSelector(options: MountOptions = {}) {
  const onConfirmQuickRecreate = vi.fn();
  const onExitQuickRecreate = vi.fn();
  const onSelectAnalyzeEdit = vi.fn();
  render(
    <CreationPaceSelector
      creationPace={options.creationPace ?? "analyze_edit"}
      quickAuthorization={options.quickAuthorization ?? "none"}
      generationSettings={options.settings ?? generationSettings}
      clearedReason={options.clearedReason ?? null}
      onConfirmQuickRecreate={onConfirmQuickRecreate}
      onExitQuickRecreate={onExitQuickRecreate}
      onSelectAnalyzeEdit={onSelectAnalyzeEdit}
    />,
  );
  return { onConfirmQuickRecreate, onExitQuickRecreate, onSelectAnalyzeEdit };
}

const expectedSnapshot: QuickGenerationAuthorizationSnapshot = {
  schemaVersion: 1,
  intent: "reconstruction",
  detailLevel: "standard",
  aspectRatioPolicy: "reference_or_fallback",
  generationSettings: { quality: "standard", model: "flux-2-dev" },
};

describe("CreationPaceSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染双入口，analyze_edit 为默认选中（aria-pressed）", () => {
    mountSelector();

    const selector = screen.getByTestId("creation-pace-selector");
    expect(selector).toBeVisible();
    expect(screen.getByTestId("pace-option-analyze-edit")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("pace-option-quick-recreate")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("quick-authorization-status")).toHaveAttribute(
      "data-authorization",
      "none",
    );
    // none 且无清除原因时不渲染任何授权提示
    expect(
      screen.queryByTestId("quick-authorization-locked-note"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("quick-authorization-cleared-reason"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("exit-quick-recreate")).not.toBeInTheDocument();
  });

  it("选择快速复刻打开确认区，焦点进入标题，五类披露来自拟保存快照", async () => {
    const user = userEvent.setup();
    mountSelector({ settings: { quality: "hd", model: "nano-banana-2-pro" } });

    await user.click(screen.getByTestId("pace-option-quick-recreate"));

    const dialog = screen.getByTestId("quick-confirm-dialog");
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(screen.getByTestId("quick-confirm-title")).toHaveFocus();
    expect(screen.getByTestId("quick-confirm-intent")).toHaveAttribute(
      "data-value",
      "reconstruction",
    );
    expect(screen.getByTestId("quick-confirm-detail-level")).toHaveAttribute(
      "data-value",
      "standard",
    );
    expect(
      screen.getByTestId("quick-confirm-aspect-ratio-policy"),
    ).toHaveAttribute("data-value", "reference_or_fallback");
    // 披露与当前共享默认生成设置同源（不复制默认常量）
    expect(
      screen.getByTestId("quick-confirm-generation-settings"),
    ).toHaveAttribute("data-quality", "hd");
    expect(
      screen.getByTestId("quick-confirm-generation-settings"),
    ).toHaveAttribute("data-model", "nano-banana-2-pro");
    expect(screen.getByTestId("quick-confirm-image-count")).toHaveAttribute(
      "data-value",
      "1",
    );
  });

  it("确认时以同一拟保存快照调用原子持久化回调并关闭确认区", async () => {
    const user = userEvent.setup();
    const handlers = mountSelector();

    await user.click(screen.getByTestId("pace-option-quick-recreate"));
    await user.click(screen.getByTestId("quick-confirm-confirm"));

    expect(handlers.onConfirmQuickRecreate).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirmQuickRecreate).toHaveBeenCalledWith(
      expectedSnapshot,
    );
    expect(screen.queryByTestId("quick-confirm-dialog")).not.toBeInTheDocument();
    // 确认后焦点回到触发器（确定焦点）
    expect(screen.getByTestId("pace-option-quick-recreate")).toHaveFocus();
  });

  it("取消确认零写入：不触发确认回调、确认区关闭、焦点回触发器", async () => {
    const user = userEvent.setup();
    const handlers = mountSelector();

    await user.click(screen.getByTestId("pace-option-quick-recreate"));
    await user.click(screen.getByTestId("quick-confirm-cancel"));

    expect(handlers.onConfirmQuickRecreate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-confirm-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("pace-option-quick-recreate")).toHaveFocus();
  });

  it("Escape 关闭确认区且零写入", async () => {
    const user = userEvent.setup();
    const handlers = mountSelector();

    await user.click(screen.getByTestId("pace-option-quick-recreate"));
    await user.keyboard("{Escape}");

    expect(handlers.onConfirmQuickRecreate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("quick-confirm-dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("pace-option-quick-recreate")).toHaveFocus();
  });

  it("armed 期间展示锁定说明、状态标记与退出入口；退出调用清授权回调", async () => {
    const user = userEvent.setup();
    const handlers = mountSelector({
      creationPace: "quick_recreate",
      quickAuthorization: "armed",
    });

    expect(screen.getByTestId("quick-authorization-status")).toHaveAttribute(
      "data-authorization",
      "armed",
    );
    const note = screen.getByTestId("quick-authorization-locked-note");
    expect(note).toBeVisible();
    expect(note.textContent).toMatch(/confirmed settings/i);
    expect(note.textContent).toMatch(/exit quick recreate/i);

    await user.click(screen.getByTestId("exit-quick-recreate"));
    expect(handlers.onExitQuickRecreate).toHaveBeenCalledTimes(1);
  });

  it("consumed 状态如实标记且不再展示退出入口", () => {
    mountSelector({
      creationPace: "quick_recreate",
      quickAuthorization: "consumed",
    });

    expect(screen.getByTestId("quick-authorization-status")).toHaveAttribute(
      "data-authorization",
      "consumed",
    );
    expect(screen.queryByTestId("exit-quick-recreate")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("quick-authorization-locked-note"),
    ).not.toBeInTheDocument();
  });

  it("授权清除后展示清除原因（分析失败/阻塞/退出的可见解释）", () => {
    mountSelector({
      quickAuthorization: "none",
      clearedReason: "Quick recreate was cleared because the analysis failed.",
    });

    const reason = screen.getByTestId("quick-authorization-cleared-reason");
    expect(reason).toBeVisible();
    expect(reason.textContent).toContain("analysis failed");
  });

  it("点击「分析后编辑」选项回调父级（armed 期间等价退出快速路径）", async () => {
    const user = userEvent.setup();
    const handlers = mountSelector({
      creationPace: "quick_recreate",
      quickAuthorization: "armed",
    });

    await user.click(screen.getByTestId("pace-option-analyze-edit"));
    expect(handlers.onSelectAnalyzeEdit).toHaveBeenCalledTimes(1);
  });
});
