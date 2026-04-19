"use client";

import { useState, useCallback } from "react";
import type { VisualRecipe, GenerationParams } from "@/types/models";

/** 历史恢复成功后返回的完整数据 */
export interface RestoredData {
  resultFileUrl: string;
  recipe: VisualRecipe | null;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  analysisTaskId: string;
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
  createdAt: string;
  updatedAt: string;
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
