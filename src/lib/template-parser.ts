import type {
  AnalysisTemplateSourceField,
  TemplateVariable,
} from "@/types/models";

/** 变量名正则：匹配 {{variableName}} 格式 */
const VARIABLE_PATTERN = /{{([a-zA-Z_]\w*)}}/g;
const VARIABLE_NAME_RE = /^[a-zA-Z_]\w*$/;
const VALID_SOURCE_FIELDS = new Set<AnalysisTemplateSourceField>([
  "subject",
  "scene",
  "visual_style",
  "lighting_color",
  "composition",
  "camera_language",
  "texture",
  "mood",
]);

export const TEMPLATE_VARIABLE_DEFAULT_MAX_LENGTH = 500;
export const TEMPLATE_VARIABLE_LABEL_MAX_LENGTH = 80;

/**
 * 从模板正文中提取所有变量标记
 * 返回去重的变量定义列表（按首次出现顺序）
 */
export function extractVariables(content: string): TemplateVariable[] {
  const variables: TemplateVariable[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  VARIABLE_PATTERN.lastIndex = 0;

  while ((match = VARIABLE_PATTERN.exec(content)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      variables.push({ name, defaultValue: "" });
    }
  }

  return variables;
}

/**
 * 用变量值替换模板正文中的 {{var}} 标记
 * 按变量名长度降序执行，避免短变量名误替换长变量名的子串
 */
export function replaceVariables(
  content: string,
  values: Record<string, string>
): string {
  let result = content;

  const sortedKeys = Object.keys(values).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`\\{\\{${escapedKey}\\}\\}`, "g"),
      values[key] ?? ""
    );
  }

  return result;
}

/**
 * 根据模板正文重新合并变量值。
 * 保留仍存在的变量值，新增变量为空，已删除变量被移除。
 */
export function mergeVariableValues(
  content: string,
  previousValues: Record<string, string>
): Record<string, string> {
  const variables = extractVariables(content);
  return variables.reduce<Record<string, string>>((nextValues, variable) => {
    nextValues[variable.name] = previousValues[variable.name] ?? "";
    return nextValues;
  }, {});
}

/**
 * 检测模板正文是否包含变量标记
 */
export function hasVariables(content: string): boolean {
  VARIABLE_PATTERN.lastIndex = 0;
  return VARIABLE_PATTERN.test(content);
}

/** 检测文本是否仍包含合法变量标记 */
export function hasUnresolvedVariables(content: string): boolean {
  return hasVariables(content);
}

function normalizeProvidedVariable(
  variable: TemplateVariable | undefined,
): Omit<TemplateVariable, "name"> {
  if (!variable) {
    return { defaultValue: "" };
  }

  const normalized: Omit<TemplateVariable, "name"> = {
    defaultValue:
      typeof variable.defaultValue === "string"
        ? variable.defaultValue.slice(0, TEMPLATE_VARIABLE_DEFAULT_MAX_LENGTH)
        : "",
  };

  if (
    typeof variable.label === "string" &&
    variable.label.trim().length > 0 &&
    variable.label.length <= TEMPLATE_VARIABLE_LABEL_MAX_LENGTH
  ) {
    normalized.label = variable.label;
  }

  if (
    typeof variable.sourceField === "string" &&
    VALID_SOURCE_FIELDS.has(variable.sourceField)
  ) {
    normalized.sourceField = variable.sourceField;
  }

  return normalized;
}

/**
 * 按模板正文变量名合并变量元信息。
 * 正文变量名是 source of truth；请求中的正文外、重复和非法元信息会被丢弃。
 */
export function mergeTemplateVariables(
  content: string,
  providedVariables?: TemplateVariable[],
): TemplateVariable[] {
  const contentVariables = extractVariables(content);
  const providedByName = new Map<string, TemplateVariable>();

  for (const variable of providedVariables ?? []) {
    if (!VARIABLE_NAME_RE.test(variable.name) || providedByName.has(variable.name)) {
      continue;
    }
    providedByName.set(variable.name, variable);
  }

  return contentVariables.map((variable) => ({
    name: variable.name,
    ...normalizeProvidedVariable(providedByName.get(variable.name)),
  }));
}
