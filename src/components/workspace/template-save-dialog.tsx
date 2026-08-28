"use client";

import { StyleMemorySaveWizard } from "@/components/iterations/save-style-memory-dialog";
import type { StoredVisualRecipe, TemplateVariable } from "@/types/models";
import { mergeTemplateVariables } from "@/lib/template-parser";

/**
 * plan-06（流程 B）: 工作区草稿保存向导（架构 §6.3 A/B 流程差异）。
 *
 * - 复用流程 A 的三步向导骨架（ModalDialog 原语 + 同一 testid 契约），
 *   跳过步骤 1 的代表结果勾选：首屏固定"当前没有代表结果，本次将保存为
 *   pending verification"说明区，底部"保存后状态"固定为 pending verification。
 * - 预填用 `deriveStyleMemoryPrefill`（工作区配方，现行链路 V2）+ 工作区
 *   negativePromptText（V1 兜底来源）。
 * - 提交体不含 representativeGenerationTaskId / sourceGenerationTaskId；
 *   携带 sourceAssetId（工作区有参考图时）与既有 sourceAnalysisTaskId /
 *   sourceImageUrl；保存成功由向导跳转新 Memory 详情。
 */

interface TemplateSaveDialogProps {
  open: boolean;
  /** 工作区当前提示内容（含 {{var}} 标记时按既有口径并入变量预填） */
  initialContent: string;
  initialVariables?: TemplateVariable[];
  /** 工作区当前配方（预填规则四元组依据） */
  recipe?: StoredVisualRecipe | null;
  /** 工作区负面提示文本（V1 配方无排除约束时的预填来源） */
  negativePromptText?: string;
  sourceAnalysisTaskId?: string;
  sourceAssetId?: string | null;
  sourceImageUrl?: string | null;
  onSave: (template: { id: string; name: string }) => void;
  onClose: () => void;
}

export function TemplateSaveDialog({
  open,
  initialContent,
  initialVariables = [],
  recipe = null,
  negativePromptText = "",
  sourceAnalysisTaskId,
  sourceAssetId,
  sourceImageUrl,
  onSave,
  onClose,
}: TemplateSaveDialogProps) {
  // 既有口径：content 中出现的 {{var}} 并入变量预填，避免提交体丢变量
  const contentVariables = mergeTemplateVariables(initialContent, initialVariables);
  const variables =
    contentVariables.length > 0 ? contentVariables : initialVariables.slice(0, 20);

  return (
    <StyleMemorySaveWizard
      open={open}
      flow="workspace-draft"
      initialContent={initialContent}
      initialVariables={variables}
      recipe={recipe}
      recipeSource="snapshot"
      negativePromptText={negativePromptText}
      sourceImageUrl={sourceImageUrl}
      sourceAssetId={sourceAssetId}
      sourceAnalysisTaskId={sourceAnalysisTaskId}
      onSaved={onSave}
      onClose={onClose}
    />
  );
}
