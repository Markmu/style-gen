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
