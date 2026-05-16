import type {
  AnalysisTemplateSourceField,
  AnalysisTemplateStatus,
  TemplateVariable,
  VisualRecipe,
} from "@/types/models";
import {
  extractVariables,
  hasUnresolvedVariables,
  replaceVariables,
} from "@/lib/template-parser";
import { getStructurerProvider } from "./providers";
import type { StructurerContext } from "./providers/types";

const ANALYSIS_TEMPLATE_CONTENT_MAX_LENGTH = 6000;
const ANALYSIS_TEMPLATE_REASON_MAX_LENGTH = 500;
const TEMPLATE_VARIABLE_DEFAULT_MAX_LENGTH = 500;
const TEMPLATE_VARIABLE_LABEL_MAX_LENGTH = 80;
const MAX_ANALYSIS_TEMPLATE_VARIABLES = 8;
const VARIABLE_NAME_RE = /^[a-zA-Z_]\w*$/;
const VALID_TEMPLATE_SOURCE_FIELDS = new Set<AnalysisTemplateSourceField>([
  "subject",
  "scene",
  "visual_style",
  "lighting_color",
  "composition",
  "camera_language",
  "texture",
  "mood",
]);

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

function sanitizePreview(text: string, maxLength = 160): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

type JsonParseStrategy = "trimmed" | "markdown_fence" | "object_slice";

interface JsonParseCandidate {
  strategy: JsonParseStrategy;
  text: string;
}

/** LLM 结构化整理阶段失败 */
export class StructurerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructurerError";
  }
}

/** structureAnalysis 的返回类型 */
export interface StructuredResult {
  recipe: VisualRecipe;
  promptText: string;
  negativePromptText: string;
  analysisTemplateContent: string | null;
  analysisTemplateVariables: TemplateVariable[];
  analysisTemplateStatus: AnalysisTemplateStatus;
  analysisTemplateReason: string | null;
}

export type { StructurerContext } from "./providers/types";

/**
 * 调用配置启用的 Structurer Provider，将视觉分析文本整理为结构化 VisualRecipe + Prompt
 */
export async function structureAnalysis(
  rawAnalysis: string,
  context: StructurerContext = {}
): Promise<StructuredResult> {
  const meta = {
    taskId: context.taskId ?? "unknown",
    source: context.source ?? "unknown",
    provider: process.env.VISION_PROVIDER || "replicate",
    rawAnalysisLength: rawAnalysis.length,
  };

  log("structurer_started", meta);

  try {
    const provider = getStructurerProvider();
    const text = await provider.structure({ rawAnalysis, context });
    const result = parseStructuredResponseText(text, meta);
    log("structurer_completed", {
      ...meta,
      promptLength: result.promptText.length,
      negativePromptLength: result.negativePromptText.length,
      recipeKeys: Object.keys(result.recipe),
      templateStatus: result.analysisTemplateStatus,
      templateVariableCount: result.analysisTemplateVariables.length,
      templateFallbackReason: result.analysisTemplateReason,
    });
    return result;
  } catch (error) {
    log("structurer_failed", {
      ...meta,
      stage: "runtime",
      errorName: error instanceof Error ? error.name : "UnknownError",
      error:
        error instanceof Error ? error.message : "Unknown structurer error",
      cause: getErrorCauseMessage(error),
    });

    if (error instanceof StructurerError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown structurer error";
    throw new StructurerError(`Structure analysis failed: ${message}`);
  }
}

function parseStructuredResponseText(
  text: string,
  meta: Record<string, unknown>
): StructuredResult {
  let parsed: unknown;
  let lastError: unknown = null;

  for (const candidate of getJsonParseCandidates(text)) {
    try {
      parsed = JSON.parse(candidate.text);
      if (candidate.strategy !== "trimmed") {
        log("structurer_json_normalized", {
          ...meta,
          strategy: candidate.strategy,
          responsePreview: sanitizePreview(text),
          normalizedPreview: sanitizePreview(candidate.text),
        });
      }
      return validateStructuredResult(parsed);
    } catch (error) {
      lastError = error;
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Unknown JSON parse error";
  log("structurer_json_parse_failed", {
    ...meta,
    error: message,
    responsePreview: sanitizePreview(text),
  });
  throw new StructurerError(`Failed to parse structurer JSON: ${message}`);
}

function getJsonParseCandidates(text: string): JsonParseCandidate[] {
  const trimmed = text.trim();
  const candidates: JsonParseCandidate[] = [];
  const seen = new Set<string>();

  const addCandidate = (strategy: JsonParseStrategy, value: string | undefined) => {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push({ strategy, text: normalized });
  };

  addCandidate("trimmed", trimmed);

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    addCandidate("markdown_fence", fencedMatch[1]);
  }

  const firstObjectBrace = trimmed.indexOf("{");
  const lastObjectBrace = trimmed.lastIndexOf("}");
  if (firstObjectBrace !== -1 && lastObjectBrace > firstObjectBrace) {
    addCandidate(
      "object_slice",
      trimmed.slice(firstObjectBrace, lastObjectBrace + 1)
    );
  }

  return candidates;
}

function getErrorCauseMessage(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause) {
    return null;
  }

  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }

  if (typeof cause === "object") {
    try {
      return JSON.stringify(cause);
    } catch {
      return String(cause);
    }
  }

  return String(cause);
}

function normalizeReason(reason: unknown, fallback: string): string {
  const text = typeof reason === "string" && reason.trim() ? reason.trim() : fallback;
  return text.length > ANALYSIS_TEMPLATE_REASON_MAX_LENGTH
    ? `${text.slice(0, ANALYSIS_TEMPLATE_REASON_MAX_LENGTH - 1)}…`
    : text;
}

function fallbackTemplate(
  reason: unknown,
  fallbackReason: string,
): Pick<
  StructuredResult,
  | "analysisTemplateContent"
  | "analysisTemplateVariables"
  | "analysisTemplateStatus"
  | "analysisTemplateReason"
> {
  return {
    analysisTemplateContent: null,
    analysisTemplateVariables: [],
    analysisTemplateStatus: "fallback",
    analysisTemplateReason: normalizeReason(reason, fallbackReason),
  };
}

function normalizeTemplateStatus(status: unknown): AnalysisTemplateStatus {
  return status === "ready" || status === "partial" || status === "fallback"
    ? status
    : "fallback";
}

function normalizeVariable(
  name: string,
  provided: TemplateVariable | undefined,
): TemplateVariable | null {
  if (!provided || typeof provided.defaultValue !== "string") {
    return null;
  }

  const defaultValue = provided.defaultValue.trim();
  if (!defaultValue || defaultValue.length > TEMPLATE_VARIABLE_DEFAULT_MAX_LENGTH) {
    return null;
  }

  const variable: TemplateVariable = {
    name,
    defaultValue,
  };

  if (
    typeof provided.label === "string" &&
    provided.label.trim().length > 0 &&
    provided.label.length <= TEMPLATE_VARIABLE_LABEL_MAX_LENGTH
  ) {
    variable.label = provided.label.trim();
  }

  if (
    typeof provided.sourceField === "string" &&
    VALID_TEMPLATE_SOURCE_FIELDS.has(provided.sourceField)
  ) {
    variable.sourceField = provided.sourceField;
  }

  return variable;
}

function normalizeTemplateFields(
  obj: Record<string, unknown>,
): {
  template: Pick<
    StructuredResult,
    | "analysisTemplateContent"
    | "analysisTemplateVariables"
    | "analysisTemplateStatus"
    | "analysisTemplateReason"
  >;
  renderedPromptText: string | null;
} {
  if (obj.analysisTemplateStatus === undefined) {
    return {
      template: fallbackTemplate(
        obj.analysisTemplateReason,
        "missing analysisTemplateStatus"
      ),
      renderedPromptText: null,
    };
  }

  const status = normalizeTemplateStatus(obj.analysisTemplateStatus);

  if (status === "fallback") {
    return {
      template: fallbackTemplate(
        obj.analysisTemplateReason,
        "analysis template status is fallback"
      ),
      renderedPromptText: null,
    };
  }

  if (typeof obj.analysisTemplateContent !== "string" || !obj.analysisTemplateContent.trim()) {
    return {
      template: fallbackTemplate(
        obj.analysisTemplateReason,
        "missing analysisTemplateContent"
      ),
      renderedPromptText: null,
    };
  }

  const content = obj.analysisTemplateContent.trim();
  if (content.length > ANALYSIS_TEMPLATE_CONTENT_MAX_LENGTH) {
    return {
      template: fallbackTemplate(
        obj.analysisTemplateReason,
        "analysisTemplateContent exceeds length limit"
      ),
      renderedPromptText: null,
    };
  }

  const contentVariables = extractVariables(content)
    .filter((variable) => VARIABLE_NAME_RE.test(variable.name))
    .slice(0, MAX_ANALYSIS_TEMPLATE_VARIABLES);

  if (contentVariables.length === 0) {
    return {
      template: fallbackTemplate(
        obj.analysisTemplateReason,
        "analysisTemplateContent has no valid variables"
      ),
      renderedPromptText: null,
    };
  }

  if (!Array.isArray(obj.analysisTemplateVariables)) {
    return {
      template: fallbackTemplate(
        obj.analysisTemplateReason,
        "missing analysisTemplateVariables"
      ),
      renderedPromptText: null,
    };
  }

  const providedByName = new Map<string, TemplateVariable>();
  for (const value of obj.analysisTemplateVariables) {
    if (!value || typeof value !== "object") continue;
    const variable = value as TemplateVariable;
    if (
      typeof variable.name !== "string" ||
      !VARIABLE_NAME_RE.test(variable.name) ||
      providedByName.has(variable.name)
    ) {
      continue;
    }
    providedByName.set(variable.name, variable);
  }

  const variables = contentVariables
    .map((variable) => normalizeVariable(variable.name, providedByName.get(variable.name)))
    .filter((variable): variable is TemplateVariable => variable !== null);

  if (variables.length === 0) {
    return {
      template: fallbackTemplate(
        obj.analysisTemplateReason,
        "analysisTemplateVariables has no usable defaults"
      ),
      renderedPromptText: null,
    };
  }

  const defaults = variables.reduce<Record<string, string>>((values, variable) => {
    values[variable.name] = variable.defaultValue;
    return values;
  }, {});
  const renderedPromptText = replaceVariables(content, defaults);

  if (hasUnresolvedVariables(renderedPromptText)) {
    return {
      template: fallbackTemplate(
        obj.analysisTemplateReason,
        "rendered prompt still contains unresolved variables"
      ),
      renderedPromptText: null,
    };
  }

  return {
    template: {
      analysisTemplateContent: content,
      analysisTemplateVariables: variables,
      analysisTemplateStatus: status,
      analysisTemplateReason:
        typeof obj.analysisTemplateReason === "string" &&
        obj.analysisTemplateReason.trim().length > 0
          ? normalizeReason(obj.analysisTemplateReason, "")
          : null,
    },
    renderedPromptText,
  };
}

/** 验证并断言 parsed 数据符合 StructuredResult 结构 */
function validateStructuredResult(parsed: unknown): StructuredResult {
  if (!parsed || typeof parsed !== "object") {
    throw new StructurerError("Invalid JSON structure: not an object");
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj.recipe || typeof obj.recipe !== "object") {
    throw new StructurerError("Invalid JSON structure: missing recipe object");
  }

  if (typeof obj.promptText !== "string" || !obj.promptText) {
    throw new StructurerError(
      "Invalid JSON structure: missing or empty promptText"
    );
  }

  if (typeof obj.negativePromptText !== "string") {
    throw new StructurerError(
      "Invalid JSON structure: missing negativePromptText"
    );
  }

  const recipe = obj.recipe as Record<string, unknown>;
  const requiredStrings = [
    "imageSummary",
    "subject",
    "scene",
    "composition",
    "cameraLanguage",
    "lighting",
    "color",
    "texture",
    "mood",
  ] as const;

  for (const field of requiredStrings) {
    if (typeof recipe[field] !== "string" || !recipe[field]) {
      throw new StructurerError(
        `Invalid recipe: missing or empty field "${field}"`
      );
    }
  }

  const requiredArrays = [
    "styleTags",
    "visualKeywords",
    "mustKeep",
    "replaceable",
  ] as const;

  for (const field of requiredArrays) {
    if (!Array.isArray(recipe[field]) || recipe[field].length === 0) {
      throw new StructurerError(
        `Invalid recipe: "${field}" must be a non-empty array`
      );
    }
  }

  const { template, renderedPromptText } = normalizeTemplateFields(obj);

  return {
    recipe: recipe as unknown as VisualRecipe,
    promptText: renderedPromptText ?? (obj.promptText as string),
    negativePromptText: obj.negativePromptText as string,
    ...template,
  };
}
