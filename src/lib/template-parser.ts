import type { TemplateVariable } from "@/types/models";

/** 变量名正则：匹配 {{variableName}} 格式 */
const VARIABLE_PATTERN = /{{([a-zA-Z_]\w*)}}/g;

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
 * 检测模板正文是否包含变量标记
 */
export function hasVariables(content: string): boolean {
  VARIABLE_PATTERN.lastIndex = 0;
  return VARIABLE_PATTERN.test(content);
}
