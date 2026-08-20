import type { StructuredResult } from "@/lib/ai/structurer";

/** One projection for both synchronous and webhook completion paths. */
export function toAnalysisCompletionUpdate(
  structured: StructuredResult,
  rawAnalysis: string,
) {
  return {
    status: "completed" as const,
    recipe: structured.recipe,
    promptText: structured.promptText,
    negativePromptText: structured.negativePromptText,
    rawResponse: rawAnalysis,
    analysisTemplateContent: structured.analysisTemplateContent ?? null,
    analysisTemplateVariables: structured.analysisTemplateVariables ?? [],
    analysisTemplateStatus: structured.analysisTemplateStatus ?? "fallback" as const,
    analysisTemplateReason: structured.analysisTemplateReason ?? null,
  };
}

/** L3 降级投影：结构化失败时以原始视觉分析完成任务 */
export function toAnalysisFallbackUpdate(
  rawAnalysis: string,
  errorMessage: string,
) {
  return {
    status: "completed" as const,
    recipe: null,
    promptText: rawAnalysis,
    negativePromptText: "",
    rawResponse: rawAnalysis,
    analysisTemplateContent: null,
    analysisTemplateVariables: [],
    analysisTemplateStatus: "fallback" as const,
    analysisTemplateReason: errorMessage,
    errorMessage,
    errorStage: "llm" as const,
  };
}
