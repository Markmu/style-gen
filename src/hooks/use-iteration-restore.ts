"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { IterationDetail } from "@/types/models";
import { computeRestoreGuard } from "@/lib/iterations/restore-guard";
import {
  readWorkspaceSnapshot,
  writeIterationRestoreSnapshot,
} from "@/hooks/use-workspace-state";

/**
 * plan-04（架构 §6.3 / ADR-4）："继续此方向 / 修正并继续"恢复 hook。
 *
 * - 守卫判定：`direct`（三豁免任一成立）直接应用；`confirm` 挂起等待
 *   替换确认对话框，取消则两侧零变更（停留详情）。
 * - 应用 = 把 `IterationDetail` 字段子集写入既有工作台持久化通道并同步
 *   flush（防抖窗口内必须显式落盘，避免导航后工作台挂载读到旧快照），
 *   随后 `router.push('/workspace')`；恢复动作不发出任何生成或写请求。
 * - 幂等：对同一目标重复恢复（守卫豁免②）不产生额外副作用。
 */

/** 守卫判定为 confirm 时挂起的替换请求（供确认对话框展示两侧摘要） */
export interface PendingIterationReplace {
  target: IterationDetail;
  /** 当前工作台未完成内容的提示文本（对话框"当前方向"摘要） */
  currentPrompt: string;
  /** 守卫判定原因（埋点/排查用） */
  reason: string;
}

export function useIterationRestore() {
  const router = useRouter();
  const [pendingReplace, setPendingReplace] =
    useState<PendingIterationReplace | null>(null);

  const applyAndNavigate = useCallback(
    (target: IterationDetail) => {
      writeIterationRestoreSnapshot({
        iterationId: target.id,
        promptSnapshot: target.promptSnapshot,
        negativePromptSnapshot: target.negativePromptSnapshot,
        params: target.params,
        analysisTaskId: target.analysisTaskId,
        recipe: target.recipe,
        variables: target.variables,
        sourceAssetId: target.sourceAssetId,
        sourceImageUrl: target.sourceImageUrl,
        sourceTemplateId: target.sourceTemplateId,
        resultFileUrl: target.resultFileUrl,
      });
      // 纯客户端恢复（ADR-4）：仅本地通道落盘，零网络请求
      router.push("/workspace");
    },
    [router],
  );

  /** 详情主动作入口（completed“继续此方向”/ failed“修正并继续”共用） */
  const restore = useCallback(
    (target: IterationDetail) => {
      const current = readWorkspaceSnapshot();
      const guard = computeRestoreGuard(current, target);

      if (guard.action === "direct") {
        applyAndNavigate(target);
        return;
      }

      setPendingReplace({
        target,
        currentPrompt: current?.promptText ?? "",
        reason: guard.reason,
      });
    },
    [applyAndNavigate],
  );

  /** 确认切换：应用载荷 + flush + 导航回工作台 */
  const confirmReplace = useCallback(() => {
    if (!pendingReplace) return;
    const target = pendingReplace.target;
    setPendingReplace(null);
    applyAndNavigate(target);
  }, [applyAndNavigate, pendingReplace]);

  /** 取消：关闭对话框，详情与工作台两侧零变更（停留详情） */
  const cancelReplace = useCallback(() => {
    setPendingReplace(null);
  }, []);

  return { restore, pendingReplace, confirmReplace, cancelReplace };
}
