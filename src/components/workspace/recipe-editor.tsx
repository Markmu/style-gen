"use client";

import { useState, useCallback } from "react";
import type { VisualRecipe } from "@/types/models";
import type {
  WorkspaceState,
  DegradationState,
  WorkspaceError,
} from "@/hooks/use-workspace-state";
import { ErrorDisplay, type ApiErrorCode } from "@/components/workspace/error-display";
import { AnalysisProgress } from "@/components/workspace/analysis-progress";
import {
  RECIPE_ROW_MAPPING,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- exported public API for downstream consumers
  RECIPE_EXTRA_FIELDS,
  type RecipeRowKey,
} from "@/lib/constants/recipe-row-mapping";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface RecipeEditorProps {
  recipe: VisualRecipe | null;
  onChange?: (recipe: VisualRecipe) => void;
  degraded?: boolean;
  onSaveTemplate?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TRUNCATE_LENGTH = 60;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a human-readable summary string for a row by joining its field values */
function buildRowText(recipe: VisualRecipe, rowIndex: number): string {
  const row = RECIPE_ROW_MAPPING[rowIndex];
  const parts: string[] = [];
  for (const field of row.fields) {
    const val = (recipe as unknown as Record<string, unknown>)[field];
    if (Array.isArray(val)) {
      if (val.length > 0) parts.push(val.join("/"));
    } else if (typeof val === "string" && val) {
      parts.push(val);
    }
  }
  return parts.join(" / ");
}

/** Truncate text to ~60 chars with ellipsis */
function truncate(text: string, maxLen: number = TRUNCATE_LENGTH): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/* ------------------------------------------------------------------ */
/*  Internal sub-components                                            */
/* ------------------------------------------------------------------ */

/** Single editable row in the summary */
function EditableRow({
  label,
  text,
  isEditing,
  isReadOnly,
  onEdit,
}: {
  label: string;
  text: string;
  isEditing: boolean;
  isReadOnly: boolean;
  onEdit: () => void;
}) {
  if (isEditing && !isReadOnly) {
    return (
      <div className="rounded-lg bg-[var(--surface-bright)] p-3 ring-1 ring-[var(--border)]">
        <span className="label-tech mb-2 block text-xs text-[var(--text-secondary)]">
          {label}
        </span>
        {/* Inline editing is handled by the parent ExpandedRowEditor */}
      </div>
    );
  }

  const displayText = text || "\u2014";

  return (
    <div
      className={`group flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
        isReadOnly ? "" : "hover:bg-[var(--surface-bright)]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <span className="label-tech mr-3 shrink-0 text-xs text-[var(--text-secondary)]">
          {label}
        </span>
        <span
          className="text-sm text-[var(--text-primary)]"
          title={text || undefined}
        >
          {truncate(displayText)}
        </span>
      </div>
      {!isReadOnly && (
        <button
          onClick={onEdit}
          className="ml-2 shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--surface-hover)]"
          type="button"
          aria-label={`编辑 ${label}`}
        >
          <svg
            className="h-4 w-4 text-[var(--text-secondary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Expanded inline editor for a single row's sub-fields */
function ExpandedRowEditor({
  rowIndex,
  recipe,
  onUpdateField,
  onFinish,
}: {
  rowIndex: number;
  recipe: VisualRecipe;
  onUpdateField: (field: string, value: unknown) => void;
  onFinish: () => void;
}) {
  const row = RECIPE_ROW_MAPPING[rowIndex];

  const handleFieldChange = useCallback(
    (field: string, value: string) => {
      // For array fields (styleTags), split by comma
      if (field === "styleTags") {
        const tags = value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        onUpdateField(field, tags);
      } else {
        onUpdateField(field, value);
      }
    },
    [onUpdateField],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.preventDefault();
        onFinish();
      }
    },
    [onFinish],
  );

  return (
    <div className="space-y-2 rounded-lg bg-[var(--surface-bright)] p-3 ring-1 ring-[var(--border)]">
      <span className="label-tech block text-xs text-[var(--text-secondary)]">
        {row.label} \u00B7 编辑
      </span>
      {row.fields.map((field) => {
        const val = (recipe as unknown as Record<string, unknown>)[field];
        let displayValue: string;

        if (Array.isArray(val)) {
          displayValue = val.join(", ");
        } else if (typeof val === "string") {
          displayValue = val;
        } else {
          displayValue = "";
        }

        return (
          <div key={field} className="flex items-center gap-2">
            <label
              htmlFor={`recipe-field-${field}`}
              className="shrink-0 text-xs text-[var(--text-secondary)]"
            >
              {field === "styleTags"
                ? "Style Tags"
                : field === "cameraLanguage"
                  ? "Camera Lang."
                  : field.charAt(0).toUpperCase() + field.slice(1)}
              :
            </label>
            {field === "styleTags" ? (
              <input
                id={`recipe-field-${field}`}
                type="text"
                defaultValue={displayValue}
                onChange={(e) => handleFieldChange(field, e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-base)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
                placeholder="用逗号分隔标签"
              />
            ) : (
              <input
                id={`recipe-field-${field}`}
                type="text"
                defaultValue={displayValue}
                onChange={(e) => handleFieldChange(field, e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-base)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30"
              />
            )}
          </div>
        );
      })}
      <button
        onClick={onFinish}
        className="mt-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
        type="button"
      >
        完成
      </button>
    </div>
  );
}

/** Tag list display */
function TagList({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-block rounded-full bg-[var(--surface-bright)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

/** Field value display for extra fields section */
function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 label-tech text-[var(--text-secondary)]">
        {label}
      </span>
      <span className="text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

/** Extra fields detail view (read-only) */
function ExtraFieldsDetail({ recipe }: { recipe: VisualRecipe }) {
  return (
    <div className="space-y-4 pt-4 border-t border-[var(--border)] mt-4">
      <FieldValue label="Image Summary" value={recipe.imageSummary} />

      <div className="flex gap-2">
        <span className="shrink-0 label-tech text-[var(--text-secondary)]">
          Visual Keywords
        </span>
        <TagList tags={recipe.visualKeywords} />
      </div>

      <div>
        <span className="label-tech text-emerald-400">Must Keep</span>
        <div className="mt-1">
          <TagList tags={recipe.mustKeep} />
        </div>
      </div>

      <div>
        <span className="label-tech text-amber-400">Replaceable</span>
        <div className="mt-1">
          <TagList tags={recipe.replaceable} />
        </div>
      </div>
    </div>
  );
}

/** Degradation hint card (ported from RecipeStep) */
function DegradationHint({
  title,
  description,
  showSpinner,
}: {
  title: string;
  description: string;
  showSpinner?: boolean;
}) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div className={showSpinner ? "flex items-center gap-3" : ""}>
        {showSpinner && (
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
        )}
        <div>
          <p className="text-sm font-medium text-amber-400">{title}</p>
          <p className="mt-1 text-xs text-amber-400/70">{description}</p>
        </div>
      </div>
    </div>
  );
}

function SaveTemplateButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md border border-[var(--border-interactive)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
    >
      保存为模板
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function RecipeEditor({
  recipe,
  onChange,
  degraded = false,
  onSaveTemplate,
}: RecipeEditorProps) {
  const [expandedRow, setExpandedRow] = useState<RecipeRowKey | null>(null);
  const [showExtraFields, setShowExtraFields] = useState(false);

  // Local mutable copy for editing (synced back via onChange)
  const [editingRecipe, setEditingRecipe] = useState<VisualRecipe | null>(
    recipe ? { ...recipe } : null,
  );

  // Sync editingRecipe when external recipe changes (but not during active edit)
  // We use a ref-like approach: only sync when not editing and recipe differs
  const isEditable = !!onChange;

  /** Handle clicking edit icon on a row */
  const handleEditRow = useCallback(
    (key: RecipeRowKey) => {
      if (!isEditable) return;
      // If clicking the same row that's already expanded, collapse it
      if (expandedRow === key) {
        setExpandedRow(null);
        return;
      }
      // Switch to new row — blur auto-saves current row implicitly
      setExpandedRow(key);
      // Ensure local copy is fresh before editing
      if (recipe && !editingRecipe) {
        setEditingRecipe({ ...recipe });
      }
    },
    [isEditable, expandedRow, recipe, editingRecipe],
  );

  /** Update a single field in the local editing copy */
  const handleUpdateField = useCallback(
    (field: string, value: unknown) => {
      setEditingRecipe((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, [field]: value };
        return updated;
      });
    },
    [],
  );

  /** Finish editing a row: call onChange with updated recipe */
  const handleFinishEdit = useCallback(() => {
    if (editingRecipe && onChange) {
      onChange(editingRecipe);
    }
    setExpandedRow(null);
  }, [editingRecipe, onChange]);

  /** Toggle extra fields visibility */
  const handleToggleExtraFields = useCallback(() => {
    setShowExtraFields((prev) => !prev);
  }, []);

  // --- Empty state ---
  if (!recipe) {
    return (
      <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
        {onSaveTemplate && (
          <div className="flex justify-end">
            <SaveTemplateButton onClick={onSaveTemplate} />
          </div>
        )}
        <p className="text-sm text-[var(--text-secondary)]">
          上传参考图开始分析
        </p>
      </div>
    );
  }

  // Use editingRecipe if available (during active edit), otherwise use prop recipe
  const displayRecipe = editingRecipe ?? recipe;

  return (
    <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
      {onSaveTemplate && (
        <div className="flex justify-end">
          <SaveTemplateButton onClick={onSaveTemplate} />
        </div>
      )}

      {/* Degraded overlay */}
      {degraded && (
        <DegradationHint
          title="分析服务暂时不可用，请稍后重试"
          description="已有分析结果仍可查看和编辑"
        />
      )}

      {/* 4-row summary */}
      <div
        className={`space-y-1 ${degraded ? "opacity-50 pointer-events-none" : ""}`}
      >
        {RECIPE_ROW_MAPPING.map((row, idx) => {
          const rowText = buildRowText(displayRecipe, idx);
          const isThisRowExpanded = expandedRow === row.key;

          return (
            <div key={row.key}>
              {!isThisRowExpanded ? (
                <EditableRow
                  label={row.label}
                  text={rowText}
                  isEditing={false}
                  isReadOnly={!isEditable}
                  onEdit={() => handleEditRow(row.key)}
                />
              ) : (
                <ExpandedRowEditor
                  rowIndex={idx}
                  recipe={displayRecipe}
                  onUpdateField={handleUpdateField}
                  onFinish={handleFinishEdit}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Expand/collapse extra fields button */}
      <button
        onClick={handleToggleExtraFields}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--surface-bright)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)]"
        type="button"
      >
        <span>
          {showExtraFields ? "收起完整配方" : "查看完整配方"}
        </span>
        <svg
          className={`h-4 w-4 transition-transform duration-300 ${showExtraFields ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expandable extra fields (with CSS grid animation) */}
      <div
        className={`grid overflow-hidden transition-all duration-300 ease-out ${
          showExtraFields ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0">
          <ExtraFieldsDetail recipe={displayRecipe} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Wrapper with degradation/error handling (for workspace integration) */
/* ------------------------------------------------------------------ */

interface RecipeEditorWithDegradeProps {
  recipe: VisualRecipe | null;
  onChange?: (recipe: VisualRecipe) => void;
  state: WorkspaceState;
  degradation: DegradationState;
  promptText?: string;
  error: WorkspaceError | null;
  onRetry: () => void;
  onReplace: () => void;
  onSaveTemplate?: () => void;
}

/**
 * RecipeEditorWithDegrade wraps RecipeEditor with the same L1/L3/L4
 * degradation handling logic as the original RecipeStep.
 * This allows workspace/page.tsx to swap RecipeStep → this wrapper
 * with minimal changes.
 */
export function RecipeEditorWithDegrade({
  recipe,
  onChange,
  state,
  degradation,
  promptText,
  error,
  onRetry,
  onReplace,
  onSaveTemplate,
}: RecipeEditorWithDegradeProps) {
  // --- Determine which degradation/error to show ---
  const isAnalysisError =
    state === "idle" && error && error.stage !== "generation";

  // L3: LLM failed — analysis_ready with no recipe but has promptText
  const isL3Degraded =
    state === "analysis_ready" && !recipe && !!promptText;

  // L1: analysis queueing
  const isL1AnalysisQueueing =
    state === "analyzing" && degradation.analysisQueueing;

  // L4: analysis unavailable
  const isL4AnalysisUnavailable = degradation.analysisUnavailable;

  // --- Error display (priority over degradation) ---
  if (isAnalysisError && error) {
    return (
      <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
        {error.code ? (
          <ErrorDisplay
            code={error.code as ApiErrorCode}
            message={error.message}
            retryable={error.retryable ?? true}
            onRetry={onRetry}
            onReplace={onReplace}
          />
        ) : (
          <AnalysisProgress
            isAnalyzing={false}
            error={error}
            onRetry={onRetry}
          />
        )}
      </div>
    );
  }

  // --- L1 analysis queueing ---
  if (isL1AnalysisQueueing) {
    return (
      <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
        <DegradationHint
          title="分析排队中，请耐心等待"
          description="当前请求较多，处理可能需要更长时间"
          showSpinner
        />
      </div>
    );
  }

  // --- L4 + L3 hints ---
  const showL4Hint = isL4AnalysisUnavailable && !isAnalysisError;
  const showL3Hint = isL3Degraded;

  // When recipe is null and not in L3/error state, don't render
  if (!recipe && !showL3Hint && !showL4Hint) return null;

  return (
    <div className="space-y-3">
      {/* L4: analysis unavailable hint */}
      {showL4Hint && (
        <DegradationHint
          title="分析服务暂时不可用，请稍后重试"
          description="已有分析结果仍可查看和编辑"
        />
      )}

      {/* L3: LLM failed, raw analysis fallback */}
      {showL3Hint && (
        <DegradationHint
          title="AI 结构化处理失败，已降级为原始分析结果"
          description="您可以基于以下原始分析结果手动编写或调整 Prompt"
        />
      )}

      {/* Main editor (greyed out when L4) */}
      <RecipeEditor
        recipe={recipe}
        onChange={onChange}
        degraded={showL4Hint}
        onSaveTemplate={onSaveTemplate}
      />
    </div>
  );
}
