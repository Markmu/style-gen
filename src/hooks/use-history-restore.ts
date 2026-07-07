"use client";

import { useState, useCallback } from "react";
import type { VisualRecipe, GenerationParams, TemplateVariable } from "@/types/models";

/** 历史恢复成功后返回的完整数据 */
export interface RestoredData {
  resultFileUrl: string;
  recipe: VisualRecipe | null;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  analysisTaskId: string;
  sourceAssetId: string | null;
  sourceImageUrl: string | null;
  variables: TemplateVariable[];
}

/** GET /api/generation/:id 扩展响应（含 recipe） */
interface GenerationTaskDetailResponse {
  id: string;
  analysisTaskId: string;
  status: string;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
  resultAssetId: string;
  resultFileUrl: string;
  recipe?: VisualRecipe | null;
  sourceAssetId?: string | null;
  sourceImageUrl?: string | null;
  variables?: TemplateVariable[];
  analysisTemplateVariables?: TemplateVariable[];
  createdAt: string;
  updatedAt: string;
}

function isTemplateVariable(value: unknown): value is TemplateVariable {
  if (!value || typeof value !== "object") return false;
  const variable = value as Record<string, unknown>;
  return (
    typeof variable.name === "string" &&
    /^[a-zA-Z_]\w*$/.test(variable.name) &&
    typeof variable.defaultValue === "string"
  );
}

function normalizeVariables(value: unknown): TemplateVariable[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTemplateVariable).slice(0, 20);
}

function deriveVariablesFromRecipe(recipe: VisualRecipe | null | undefined): TemplateVariable[] {
  if (!recipe) return [];

  const candidates: TemplateVariable[] = [
    {
      name: "subject",
      label: "Subject",
      defaultValue: recipe.subject,
      sourceField: "subject",
    },
    {
      name: "style_direction",
      label: "Style direction",
      defaultValue:
        recipe.styleTags?.slice(0, 3).join(", ") ||
        recipe.visualKeywords?.slice(0, 3).join(", ") ||
        recipe.mood,
      sourceField: "visual_style",
    },
    {
      name: "lighting_color",
      label: "Lighting and color",
      defaultValue: [recipe.lighting, recipe.color].filter(Boolean).join("; "),
      sourceField: "lighting_color",
    },
  ];

  return candidates.filter((variable) => variable.defaultValue.trim()).slice(0, 3);
}

async function fetchGenerationDetail(
  id: string
): Promise<GenerationTaskDetailResponse> {
  const res = await fetch(`/api/generation/${id}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ?? "Failed to fetch generation detail"
    );
  }
  return res.json() as Promise<GenerationTaskDetailResponse>;
}

export function useHistoryRestore() {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const restore = useCallback(async (id: string): Promise<RestoredData> => {
    setIsRestoring(true);
    setError(null);

    try {
      const detail = await fetchGenerationDetail(id);

      const restoredData: RestoredData = {
        resultFileUrl: detail.resultFileUrl,
        recipe: detail.recipe ?? null,
        promptSnapshot: detail.promptSnapshot,
        negativePromptSnapshot: detail.negativePromptSnapshot,
        params: detail.params,
        analysisTaskId: detail.analysisTaskId,
        sourceAssetId: detail.sourceAssetId ?? null,
        sourceImageUrl: detail.sourceImageUrl ?? null,
        variables:
          normalizeVariables(detail.variables).length > 0
            ? normalizeVariables(detail.variables)
            : normalizeVariables(detail.analysisTemplateVariables).length > 0
              ? normalizeVariables(detail.analysisTemplateVariables)
              : deriveVariablesFromRecipe(detail.recipe),
      };

      return restoredData;
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to restore generation");
      setError(error);
      throw error;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  return { restore, isRestoring, error };
}
