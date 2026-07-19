import type {
  AnalysisTemplateSourceField,
  TemplateVariable,
} from "@/types/models";

/** Variable marker supports Unicode letters, internal spaces, and hyphens. */
const VARIABLE_PATTERN = /{{([^{}]+)}}/g;
const VARIABLE_NAME_RE = /^[\p{L}_][\p{L}\p{N}_ -]*$/u;
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

export function normalizeVariableName(name: string): string | null {
  const normalized = name.trim();
  return VARIABLE_NAME_RE.test(normalized) ? normalized : null;
}

export function isValidVariableName(name: string): boolean {
  return normalizeVariableName(name) !== null;
}

export interface LinkedTextVariableRange {
  start: number;
  end: number;
}

export interface LinkedTextVariableState {
  name: string;
  ranges: LinkedTextVariableRange[];
}

export interface LinkedTextVariableEdit {
  name: string;
  value: string;
  promptText: string;
  linkState: LinkedTextVariableState;
}

/**
 * 从模板正文中提取所有Variables标记
 * 返回去重的Variables定义列表（按首次出现顺序）
 */
export function extractVariables(content: string): TemplateVariable[] {
  const variables: TemplateVariable[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  VARIABLE_PATTERN.lastIndex = 0;

  while ((match = VARIABLE_PATTERN.exec(content)) !== null) {
    const name = normalizeVariableName(match[1]);
    if (!name) continue;
    if (!seen.has(name)) {
      seen.add(name);
      variables.push({ name, defaultValue: "" });
    }
  }

  return variables;
}

/**
 * 用Variables值替换模板正文中的 {{var}} 标记。
 * 变量名会去除标记内部的首尾空格，保留变量名中的内部空格和横线。
 */
export function replaceVariables(
  content: string,
  values: Record<string, string>
): string {
  return content.replace(VARIABLE_PATTERN, (marker, rawName: string) => {
    const name = normalizeVariableName(rawName);
    if (!name || !Object.prototype.hasOwnProperty.call(values, name)) {
      return marker;
    }
    return values[name] ?? "";
  });
}

/**
 * 根据模板正文重新合并Variables值。
 * 保留仍存在的Variables值，新增Variables为空，已DeleteVariables被移除。
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
 * 检测模板正文是否包含Variables标记
 */
export function hasVariables(content: string): boolean {
  return extractVariables(content).length > 0;
}

/** 检测文本是否仍包含合法Variables标记 */
export function hasUnresolvedVariables(content: string): boolean {
  return hasVariables(content);
}

interface TextEdit {
  start: number;
  end: number;
  insertedText: string;
}

interface VariableOccurrence extends LinkedTextVariableRange {
  name: string;
}

function describeTextEdit(previousText: string, nextText: string): TextEdit | null {
  if (previousText === nextText) return null;

  let start = 0;
  while (
    start < previousText.length &&
    start < nextText.length &&
    previousText[start] === nextText[start]
  ) {
    start += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previousText.length - start &&
    suffixLength < nextText.length - start &&
    previousText[previousText.length - 1 - suffixLength] ===
      nextText[nextText.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    start,
    end: previousText.length - suffixLength,
    insertedText: nextText.slice(start, nextText.length - suffixLength),
  };
}

function editFitsRange(edit: TextEdit, range: LinkedTextVariableRange) {
  if (edit.start === edit.end) {
    return edit.start >= range.start && edit.start <= range.end;
  }

  return edit.start >= range.start && edit.end <= range.end;
}

function findOccurrences(source: string, target: string) {
  const normalizedSource = source.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  const occurrences: LinkedTextVariableRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = normalizedSource.indexOf(normalizedTarget, cursor);
    if (start === -1) break;

    const end = start + target.length;
    occurrences.push({ start, end });
    cursor = end;
  }

  return occurrences;
}

function rangesOverlap(
  left: LinkedTextVariableRange,
  right: LinkedTextVariableRange,
) {
  return left.start < right.end && left.end > right.start;
}

function findVariableOccurrences(
  promptText: string,
  variables: TemplateVariable[],
  values: Record<string, string>,
) {
  const claimedRanges: LinkedTextVariableRange[] = [];
  const occurrences: VariableOccurrence[] = [];
  const candidates = variables
    .map((variable) => ({
      variable,
      visibleValue: (values[variable.name] ?? variable.defaultValue ?? "").trim(),
    }))
    .filter((candidate) => candidate.visibleValue.length >= 2)
    .sort((left, right) => right.visibleValue.length - left.visibleValue.length);

  for (const { variable, visibleValue } of candidates) {
    for (const range of findOccurrences(promptText, visibleValue)) {
      if (claimedRanges.some((claimed) => rangesOverlap(claimed, range))) continue;

      claimedRanges.push(range);
      occurrences.push({ ...range, name: variable.name });
    }
  }

  return occurrences;
}

function replaceLinkedRanges(
  previousText: string,
  ranges: LinkedTextVariableRange[],
  nextVisibleValue: string,
) {
  const sortedRanges = [...ranges].sort((left, right) => left.start - right.start);
  const nextRanges: LinkedTextVariableRange[] = [];
  let cursor = 0;
  let promptText = "";

  for (const range of sortedRanges) {
    promptText += previousText.slice(cursor, range.start);
    const start = promptText.length;
    promptText += nextVisibleValue;
    nextRanges.push({ start, end: promptText.length });
    cursor = range.end;
  }

  promptText += previousText.slice(cursor);
  return { promptText, ranges: nextRanges };
}

/**
 * Reconciles a text-mode edit with a resolved template variable.
 * Returns null when the edit touches ordinary prompt prose or crosses a variable boundary.
 */
export function reconcileLinkedTextVariableEdit(
  previousText: string,
  nextText: string,
  variables: TemplateVariable[],
  values: Record<string, string>,
  activeLink: LinkedTextVariableState | null = null,
): LinkedTextVariableEdit | null {
  const edit = describeTextEdit(previousText, nextText);
  if (!edit) return null;

  const activeValue = activeLink
    ? values[activeLink.name] ??
      variables.find((variable) => variable.name === activeLink.name)?.defaultValue ??
      ""
    : "";
  const activeLinkIsCurrent =
    activeLink?.ranges.every(
      (range) => previousText.slice(range.start, range.end) === activeValue,
    ) ?? false;
  const activeRange = activeLinkIsCurrent
    ? activeLink?.ranges.find((range) => editFitsRange(edit, range))
    : undefined;
  let editedOccurrence: VariableOccurrence | undefined;
  let linkedRanges: LinkedTextVariableRange[];

  if (activeLink && activeRange) {
    editedOccurrence = { ...activeRange, name: activeLink.name };
    linkedRanges = activeLink.ranges;
  } else {
    const occurrences = findVariableOccurrences(previousText, variables, values);
    editedOccurrence = occurrences.find((occurrence) =>
      editFitsRange(edit, occurrence),
    );
    if (!editedOccurrence) return null;
    linkedRanges = occurrences.filter(
      (occurrence) => occurrence.name === editedOccurrence?.name,
    );
  }

  const currentVisibleValue = previousText.slice(
    editedOccurrence.start,
    editedOccurrence.end,
  );
  const relativeStart = edit.start - editedOccurrence.start;
  const relativeEnd = edit.end - editedOccurrence.start;
  const nextVisibleValue = `${currentVisibleValue.slice(0, relativeStart)}${
    edit.insertedText
  }${currentVisibleValue.slice(relativeEnd)}`;
  const replacement = replaceLinkedRanges(
    previousText,
    linkedRanges,
    nextVisibleValue,
  );

  return {
    name: editedOccurrence.name,
    value: nextVisibleValue,
    promptText: replacement.promptText,
    linkState: {
      name: editedOccurrence.name,
      ranges: replacement.ranges,
    },
  };
}

/**
 * Restores variable markers inside an edited resolved prompt.
 *
 * Variables mode shows concrete values instead of raw `{{variable}}` markers.
 * When ordinary prompt prose is edited, this converts the still-visible values
 * back to markers so subsequent variable changes remain linked.
 */
export function restoreVariableMarkers(
  promptText: string,
  variables: TemplateVariable[],
  values: Record<string, string>,
): string {
  const claimedRanges: LinkedTextVariableRange[] = [];
  const occurrences: VariableOccurrence[] = [];
  const candidates = variables
    .map((variable) => ({
      variable,
      visibleValue: (values[variable.name] ?? variable.defaultValue ?? "").trim(),
    }))
    .filter((candidate) => candidate.visibleValue.length >= 2)
    .sort((left, right) => right.visibleValue.length - left.visibleValue.length);

  for (const { variable, visibleValue } of candidates) {
    for (const range of findOccurrences(promptText, visibleValue)) {
      if (claimedRanges.some((claimed) => rangesOverlap(claimed, range))) continue;

      claimedRanges.push(range);
      occurrences.push({ ...range, name: variable.name });
    }
  }

  if (occurrences.length === 0) return promptText;

  let cursor = 0;
  let template = "";
  for (const occurrence of occurrences.sort((left, right) => left.start - right.start)) {
    template += promptText.slice(cursor, occurrence.start);
    template += `{{${occurrence.name}}}`;
    cursor = occurrence.end;
  }

  return template + promptText.slice(cursor);
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
 * 按模板正文Variable name合并Variables元信息。
 * 正文Variable name是 source of truth；请求中的正文外、重复和非法元信息会被丢弃。
 */
export function mergeTemplateVariables(
  content: string,
  providedVariables?: TemplateVariable[],
): TemplateVariable[] {
  const contentVariables = extractVariables(content);
  const providedByName = new Map<string, TemplateVariable>();

  for (const variable of providedVariables ?? []) {
    const name = normalizeVariableName(variable.name);
    if (!name || providedByName.has(name)) {
      continue;
    }
    providedByName.set(name, { ...variable, name });
  }

  return contentVariables.map((variable) => ({
    name: variable.name,
    ...normalizeProvidedVariable(providedByName.get(variable.name)),
  }));
}
