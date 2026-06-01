"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import { UnifiedPromptEditor } from "@/components/workspace/unified-prompt-editor";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import type { AnalysisTemplateStatus, TemplateVariable } from "@/types/models";

interface PromptCardProps {
  state: WorkspaceState;
  promptText: string;
  negativePromptText?: string;
  templateContent?: string | null;
  templateVariables?: TemplateVariable[];
  templateStatus?: AnalysisTemplateStatus | null;
  templateReason?: string | null;
  templateKey?: string | null;
  params?: {
    aspectRatio: AspectRatio;
    quality: Quality;
  };
  onResolvedPromptChange?: (value: string) => void;
  onTemplateContentChange?: (value: string) => void;
  onTemplateVariablesChange?: (variables: TemplateVariable[]) => void;
  onNegativePromptChange?: (value: string) => void;
  onParamsChange?: (params: { aspectRatio: AspectRatio; quality: Quality }) => void;
  onSaveTemplate?: (content: string) => void;
}

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:3", "16:9", "3:4", "9:16"];
const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: "standard", label: "Standard" },
  { value: "hd", label: "HD" },
];

export function PromptCard({
  state,
  promptText,
  negativePromptText = "",
  templateContent = null,
  templateVariables = [],
  templateStatus = null,
  templateReason = null,
  templateKey = null,
  params = { aspectRatio: "1:1", quality: "standard" },
  onResolvedPromptChange,
  onTemplateContentChange,
  onTemplateVariablesChange,
  onNegativePromptChange,
  onParamsChange,
  onSaveTemplate,
}: PromptCardProps) {
  const prompt = promptText.trim();
  const isLoading = state === "analyzing";
  const [guidance, setGuidance] = useState(7);
  const [saveTemplateContent, setSaveTemplateContent] = useState(
    templateContent || promptText,
  );
  const lastSaveResetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const resetKey = templateKey ?? templateContent ?? null;
    if (resetKey === lastSaveResetKeyRef.current) return;
    lastSaveResetKeyRef.current = resetKey;
    setSaveTemplateContent(templateContent || promptText);
  }, [promptText, templateContent, templateKey]);

  const handleSaveContentChange = useCallback((value: string) => {
    setSaveTemplateContent(value);
  }, []);

  const handleAspectRatioChange = (value: AspectRatio) => {
    onParamsChange?.({ ...params, aspectRatio: value });
  };

  const handleQualityChange = (value: Quality) => {
    onParamsChange?.({ ...params, quality: value });
  };

  return (
    <article
      data-testid="prompt-card"
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-4"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Prompt
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Generation text
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {prompt && onSaveTemplate && (
            <button
              type="button"
              onClick={() => onSaveTemplate(saveTemplateContent || promptText)}
              className="h-8 rounded-md border border-[var(--border-interactive)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
            >
              Save as Template
            </button>
          )}
          <button
            type="button"
            aria-label="Prompt help"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-bright)] hover:text-[var(--text-primary)]"
          >
            <span className="icon text-[18px]" aria-hidden="true">
              help
            </span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <PromptSkeleton />
        ) : prompt ? (
          <div className="flex min-h-full flex-col gap-4">
            <div className="min-h-[360px]">
              <UnifiedPromptEditor
                initialPromptText={promptText}
                initialTemplateContent={templateContent}
                initialTemplateVariables={templateVariables}
                templateStatus={templateStatus}
                templateReason={templateReason}
                templateKey={templateKey}
                onResolvedPromptChange={onResolvedPromptChange ?? (() => undefined)}
                onTemplateContentChange={onTemplateContentChange}
                onTemplateVariablesChange={onTemplateVariablesChange}
                onSaveContentChange={handleSaveContentChange}
              />
            </div>

            <label className="flex flex-col gap-2 rounded-lg bg-[var(--surface-low)] p-4">
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Negative Prompt
              </span>
              <textarea
                aria-label="Negative Prompt"
                value={negativePromptText}
                onChange={(event) => onNegativePromptChange?.(event.target.value)}
                className="input-precision min-h-[84px] resize-none rounded-t-lg px-3 py-3 text-sm leading-6"
                placeholder="blurry, low quality, distorted, watermark, text"
              />
              <span className="text-right text-xs text-[var(--text-muted)]">
                {negativePromptText.length} chars
              </span>
            </label>

            <div className="rounded-lg bg-[var(--surface-low)] p-4">
              <p className="label-tech text-[var(--text-muted)]">Output</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    Aspect Ratio
                  </span>
                  <select
                    aria-label="Aspect Ratio"
                    value={params.aspectRatio}
                    onChange={(event) =>
                      handleAspectRatioChange(event.target.value as AspectRatio)
                    }
                    className="input-precision h-9 rounded-t-md px-2 text-sm"
                  >
                    {ASPECT_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    Quality
                  </span>
                  <select
                    aria-label="Quality"
                    value={params.quality}
                    onChange={(event) =>
                      handleQualityChange(event.target.value as Quality)
                    }
                    className="input-precision h-9 rounded-t-md px-2 text-sm"
                  >
                    {QUALITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-secondary)]">
                    Guidance Strength
                  </span>
                  <input
                    aria-label="Guidance Strength"
                    type="range"
                    min="1"
                    max="12"
                    step="1"
                    value={guidance}
                    onChange={(event) => setGuidance(Number(event.target.value))}
                    className="h-9 accent-[var(--accent-primary)]"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-control)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                  <input type="checkbox" defaultChecked className="accent-[var(--accent-primary)]" />
                  Use recipe guidance
                </label>
                <label className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-control)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                  <input type="checkbox" className="accent-[var(--accent-primary)]" />
                  Enhance details
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col justify-center rounded-lg bg-[var(--surface-low)] p-6">
            <span className="icon mb-4 text-[var(--accent-primary)]" aria-hidden="true">
              notes
            </span>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Analyze a reference image to prepare a generation prompt.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function PromptSkeleton() {
  return (
    <div className="space-y-3 rounded-lg bg-[var(--surface-low)] p-4" aria-label="Prompt loading">
      <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-full animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-11/12 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="h-3 w-3/4 animate-pulse rounded-full bg-[var(--surface-bright)]" />
    </div>
  );
}
