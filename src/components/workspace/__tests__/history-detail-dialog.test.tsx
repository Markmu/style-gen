// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryDetailDialog, type HistoryDetail } from "@/components/workspace/history-detail-dialog";

const detail: HistoryDetail = {
  id: "history-1",
  resultFileUrl: "https://cdn.example.com/result.webp",
  recipe: null,
  promptSnapshot: "A restored prompt snapshot",
  negativePromptSnapshot: "low quality",
  params: { aspectRatio: "16:9", quality: "hd" },
  analysisTaskId: "analysis-1",
};

describe("HistoryDetailDialog", () => {
  it("does not render when closed", () => {
    render(
      <HistoryDetailDialog
        open={false}
        detail={detail}
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("history-detail-dialog")).not.toBeInTheDocument();
  });

  it("shows result, prompt snapshot, and params", () => {
    render(
      <HistoryDetailDialog
        open
        detail={detail}
        onRestore={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("history-detail-dialog")).toBeInTheDocument();
    expect(screen.getByText("A restored prompt snapshot")).toBeInTheDocument();
    expect(screen.getByText("16:9")).toBeInTheDocument();
    expect(screen.getByText("hd")).toBeInTheDocument();
  });

  it("restores and closes through callbacks", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onClose = vi.fn();

    render(
      <HistoryDetailDialog
        open
        detail={detail}
        onRestore={onRestore}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Restore to workspace" }));
    await user.click(screen.getByRole("button", { name: "Close history detail" }));

    expect(onRestore).toHaveBeenCalledWith("history-1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
