// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DirectionResultRail,
  type DirectionResultRailProps,
} from "@/components/workspace/direction-result-rail";
import type {
  DirectionIterationFeed,
  DirectionIterationListItem,
} from "@/types/models";

function completedItem(
  id: string,
  overrides: Partial<DirectionIterationListItem> = {},
): DirectionIterationListItem {
  return {
    id,
    status: "completed",
    promptSummary: `Direction iteration ${id}`,
    resultFileUrl: `https://cdn.example.com/results/${id}.webp`,
    params: { aspectRatio: "1:1", quality: "standard" },
    createdAt: "2026-09-01T00:01:00.000Z",
    resultAssetId: `asset-${id}`,
    errorMessage: null,
    ...overrides,
  };
}

function activeItem(id: string): DirectionIterationListItem {
  return completedItem(id, {
    status: "processing",
    resultFileUrl: null,
    resultAssetId: null,
  });
}

function failureItem(
  id: string,
  message = "Provider model timeout",
): DirectionIterationListItem {
  return completedItem(id, {
    status: "failed",
    resultFileUrl: null,
    resultAssetId: null,
    errorMessage: message,
  });
}

function mountRail(
  props: Partial<DirectionResultRailProps> & {
    feed: DirectionIterationFeed | null;
  },
) {
  const handlers = {
    onSelect: vi.fn(),
    onSetPreferred: vi.fn(),
    onCompare: vi.fn(),
    onRegenerate: vi.fn(),
    onUseAsNewReference: vi.fn(),
    onOpenMemoryAction: vi.fn(),
    onOpenIteration: vi.fn(),
    onOpenPreferredDetail: vi.fn(),
    onRetryFailure: vi.fn(),
    onRetryFeed: vi.fn(),
  };
  render(
    <DirectionResultRail
      isLoading={false}
      isError={false}
      errorMessage={null}
      selectedIterationId={null}
      preferredIterationId={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

function railRoot() {
  return screen.getByTestId("direction-result-rail");
}

function itemById(id: string) {
  return document.querySelector<HTMLElement>(
    `[data-testid="direction-completed-item"][data-iteration-id="${id}"]`,
  ) as HTMLElement;
}

describe("DirectionResultRail", () => {
  it("三组状态同时内联呈现，active/failure 不挤占五张成功缩略图", () => {
    mountRail({
      feed: {
        completed: [1, 2, 3, 4, 5].map((n) => completedItem(`dir-c-${n}`)),
        active: activeItem("dir-active-1"),
        latestFailure: failureItem("dir-fail-1"),
      },
    });

    expect(screen.getAllByTestId("direction-completed-item")).toHaveLength(5);

    const activeFace = screen.getByTestId("direction-active-face");
    expect(activeFace).toHaveAttribute("data-iteration-id", "dir-active-1");

    const failureFace = screen.getByTestId("direction-failure-face");
    expect(failureFace).toHaveAttribute("data-iteration-id", "dir-fail-1");
    expect(
      within(failureFace).getByText("Provider model timeout"),
    ).toBeVisible();
    expect(screen.getByTestId("direction-failure-retry")).toBeVisible();

    // 三组并存时缩略图数量不变（ADR-5：三组不共享名额）
    expect(screen.getAllByTestId("direction-completed-item")).toHaveLength(5);
  });

  it("completed 缩略图渲染真实图片 URL，并保留打开完整 Iteration 入口", () => {
    mountRail({
      feed: {
        completed: [completedItem("dir-c-1"), completedItem("dir-c-2")],
        active: null,
        latestFailure: null,
      },
    });

    const first = itemById("dir-c-1");
    const img = within(first).getByRole("img");
    expect(img).toHaveAttribute(
      "src",
      "https://cdn.example.com/results/dir-c-1.webp",
    );
    expect(
      within(first).getByTestId("direction-item-open-iteration"),
    ).toBeEnabled();
  });

  it("缺结果资产：标记来源异常、不渲染 img、比较/首选等结果动作 disabled", () => {
    mountRail({
      feed: {
        completed: [
          completedItem("dir-ok"),
          completedItem("dir-missing", {
            resultFileUrl: null,
            resultAssetId: null,
          }),
        ],
        active: null,
        latestFailure: null,
      },
    });

    const ok = itemById("dir-ok");
    expect(within(ok).getByRole("img")).toBeVisible();

    const missing = itemById("dir-missing");
    expect(missing).toHaveAttribute("data-asset-missing", "true");
    expect(within(missing).queryByRole("img")).toBeNull();
    expect(
      within(missing).getByTestId("direction-item-compare"),
    ).toBeDisabled();
    expect(
      within(missing).getByTestId("direction-item-preferred"),
    ).toBeDisabled();
    expect(
      within(missing).getByTestId("direction-item-new-reference"),
    ).toBeDisabled();
  });

  it("selected 与 preferred 分离：data 属性来自各自 prop，互不自动跟随", () => {
    mountRail({
      feed: {
        completed: [completedItem("c1"), completedItem("c2")],
        active: null,
        latestFailure: null,
      },
      selectedIterationId: "c2",
      preferredIterationId: "c1",
    });

    expect(railRoot()).toHaveAttribute("data-selected-id", "c2");
    expect(railRoot()).toHaveAttribute("data-preferred-id", "c1");
    expect(itemById("c1")).toHaveAttribute("data-selected", "false");
    expect(itemById("c1")).toHaveAttribute("data-preferred", "true");
    expect(itemById("c2")).toHaveAttribute("data-selected", "true");
    expect(itemById("c2")).toHaveAttribute("data-preferred", "false");
    expect(
      within(itemById("c1")).getByTestId("direction-item-preferred"),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("preferred 滚出五条窗口：rail 仍暴露 data-preferred-id 并显示 Iteration 提示", async () => {
    const user = userEvent.setup();
    const handlers = mountRail({
      feed: {
        completed: [completedItem("c2")],
        active: null,
        latestFailure: null,
      },
      preferredIterationId: "c-out-of-window",
    });

    expect(railRoot()).toHaveAttribute("data-preferred-id", "c-out-of-window");
    expect(screen.getByText(/本次首选已保留/)).toBeVisible();

    // plan-06（AC-06 窗口外仍有效）：提示块挂 data-iteration-id + 打开详情动作
    const external = screen.getByTestId("direction-preferred-external");
    expect(external).toHaveAttribute("data-iteration-id", "c-out-of-window");
    await user.click(screen.getByTestId("direction-preferred-open-detail"));
    expect(handlers.onOpenPreferredDetail).toHaveBeenCalledWith("c-out-of-window");
  });

  it("无效首选清理提示：挂 data-iteration-id 说明原因，且不呈现窗口外提示（AC-06 两种出口互斥）", () => {
    mountRail({
      feed: {
        completed: [completedItem("c2")],
        active: null,
        latestFailure: null,
      },
      preferredIterationId: null,
      preferredInvalidNotice: {
        iterationId: "c-invalid",
        reason: "该结果属于其他方向",
      },
    });

    const invalid = screen.getByTestId("direction-preferred-invalid");
    expect(invalid).toHaveAttribute("data-iteration-id", "c-invalid");
    expect(invalid).toHaveTextContent("该结果属于其他方向");
    expect(screen.queryByTestId("direction-preferred-external")).toBeNull();
  });

  it("来源 Memory 验证状态位：data-verification 与 data-representative-iteration-id 由服务端详情派生", () => {
    mountRail({
      feed: {
        completed: [completedItem("c1")],
        active: null,
        latestFailure: null,
      },
      memoryStatus: {
        memoryName: "Direction source memory",
        verificationStatus: "pending_verification",
        representativeIterationId: null,
      },
    });

    const status = screen.getByTestId("direction-memory-status");
    expect(status).toHaveAttribute("data-verification", "pending_verification");
    expect(status).toHaveAttribute("data-representative-iteration-id", "");
    expect(status).toHaveTextContent("Direction source memory");
  });

  it("Memory 动作：每个完成条目可打开保存/更新入口，缺资产时 disabled", async () => {
    const user = userEvent.setup();
    const handlers = mountRail({
      feed: {
        completed: [
          completedItem("c-ok"),
          completedItem("c-missing", {
            resultFileUrl: null,
            resultAssetId: null,
          }),
        ],
        active: null,
        latestFailure: null,
      },
    });

    await user.click(within(itemById("c-ok")).getByTestId("direction-item-save-memory"));
    expect(handlers.onOpenMemoryAction).toHaveBeenCalledWith("c-ok");
    expect(
      within(itemById("c-missing")).getByTestId("direction-item-save-memory"),
    ).toBeDisabled();
  });

  it("点击缩略图切换当前选择；动作按钮不触发选择", async () => {
    const user = userEvent.setup();
    const handlers = mountRail({
      feed: {
        completed: [completedItem("c1"), completedItem("c2")],
        active: null,
        latestFailure: null,
      },
    });

    await user.click(within(itemById("c2")).getByRole("img"));
    expect(handlers.onSelect).toHaveBeenCalledWith("c2");

    handlers.onSelect.mockClear();
    await user.click(within(itemById("c1")).getByTestId("direction-item-compare"));
    expect(handlers.onCompare).toHaveBeenCalledWith("c1");
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("首选/比较/再次生成/新参考/打开 Iteration 回调与键盘可达", async () => {
    const user = userEvent.setup();
    const handlers = mountRail({
      feed: {
        completed: [completedItem("c1")],
        active: null,
        latestFailure: null,
      },
    });
    const first = itemById("c1");

    const preferred = within(first).getByTestId("direction-item-preferred");
    preferred.focus();
    await user.keyboard("{Enter}");
    expect(handlers.onSetPreferred).toHaveBeenCalledWith("c1");

    await user.click(within(first).getByTestId("direction-item-compare"));
    expect(handlers.onCompare).toHaveBeenCalledWith("c1");
    await user.click(within(first).getByTestId("direction-item-regenerate"));
    expect(handlers.onRegenerate).toHaveBeenCalled();
    await user.click(within(first).getByTestId("direction-item-new-reference"));
    expect(handlers.onUseAsNewReference).toHaveBeenCalledWith("c1");
    await user.click(within(first).getByTestId("direction-item-open-iteration"));
    expect(handlers.onOpenIteration).toHaveBeenCalledWith("c1");
  });

  it("失败面主动重试入口触发回调（新任务由页面提交，不复活原任务）", async () => {
    const user = userEvent.setup();
    const handlers = mountRail({
      feed: {
        completed: [],
        active: null,
        latestFailure: failureItem(
          "dir-fail-1",
          "Image provider rejected the request after 3 attempts",
        ),
      },
    });

    expect(screen.getByText(/Image provider rejected/)).toBeVisible();
    await user.click(screen.getByTestId("direction-failure-retry"));
    expect(handlers.onRetryFailure).toHaveBeenCalledTimes(1);
  });

  it("feed 失败（L2）：显示错误位与重试，保留 previous data 缩略图", async () => {
    const user = userEvent.setup();
    const handlers = mountRail({
      feed: {
        completed: [completedItem("c1"), completedItem("c2")],
        active: null,
        latestFailure: null,
      },
      isError: true,
      errorMessage: "Direction feed temporarily unavailable",
    });

    expect(screen.getByTestId("direction-feed-error")).toBeVisible();
    expect(screen.getAllByTestId("direction-completed-item")).toHaveLength(2);

    await user.click(screen.getByTestId("direction-feed-retry"));
    expect(handlers.onRetryFeed).toHaveBeenCalledTimes(1);
  });

  it("feed 失败（L2）：错误位提供「打开完整 Iteration」出口（plan-07 §8.2 L2）", async () => {
    const user = userEvent.setup();
    const handlers = mountRail({
      feed: {
        completed: [completedItem("c1")],
        active: null,
        latestFailure: null,
      },
      isError: true,
      errorMessage: "Direction feed temporarily unavailable",
    });

    const openIteration = screen.getByTestId("direction-feed-open-iteration");
    expect(openIteration).toBeVisible();
    // 出口不依赖某条结果：无参调用由页面统一导航到完整 Iteration 历史
    await user.click(openIteration);
    expect(handlers.onOpenIteration).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenIteration).toHaveBeenCalledWith();
  });

  it("空方向 feed 显示可恢复空态提示", () => {
    mountRail({ feed: { completed: [], active: null, latestFailure: null } });
    expect(screen.getByText(/还没有生成结果/)).toBeVisible();
  });

  it("初始加载中显示加载提示", () => {
    mountRail({ feed: null, isLoading: true });
    expect(screen.getByText(/正在读取本次方向的结果/)).toBeVisible();
  });
});
