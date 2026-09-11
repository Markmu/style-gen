"use client";

import { type ReactNode } from "react";

export type WorkspaceInspectorPanel = "evidence" | "draft" | "prompt";

export interface WorkspaceAgentLayoutProps {
  /** Scrollable conversation log (references chips and messages). */
  conversation: ReactNode;
  /** Composer, notices and GenerationBar — one shared instance. */
  composer: ReactNode;
  /** Canvas viewport content: view tabs, reference/result/compare, result rail. */
  canvas: ReactNode;
  /** Active inspector panel; inactive panels stay mounted but hidden. */
  inspectorPanel: WorkspaceInspectorPanel;
  onInspectorPanelChange: (panel: WorkspaceInspectorPanel) => void;
  inspectorPanels: { evidence: ReactNode; draft: ReactNode; prompt: ReactNode };
  /** Evidence-preview entry: canvas only, full width, no conversation or composer. */
  previewMode?: boolean;
}

const INSPECTOR_TABS: { id: WorkspaceInspectorPanel; label: string }[] = [
  { id: "evidence", label: "Evidence" },
  { id: "draft", label: "Draft" },
  { id: "prompt", label: "Prompt" },
];

/**
 * plan-11（架构 §4.2 M1）：Conversation/Canvas 双栏。项目仅面向桌面端，
 * 不提供移动端兼容（2026-09-11 需求变更：移除 <768px 页签与软键盘避让）。
 * Composer 与 GenerationBar 共用一个实例；Inspector 以 Evidence/Draft/Prompt
 * 页签按需呈现，不同时铺开全部检查内容。
 */
export function WorkspaceAgentLayout({
  conversation,
  composer,
  canvas,
  inspectorPanel,
  onInspectorPanelChange,
  inspectorPanels,
  previewMode = false,
}: WorkspaceAgentLayoutProps) {
  const handleInspectorKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = INSPECTOR_TABS.findIndex(tab => `workspace-inspector-tab-${tab.id}` === (event.target as HTMLElement).id);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    const next = INSPECTOR_TABS[nextIndex];
    onInspectorPanelChange(next.id);
    document.getElementById(`workspace-inspector-tab-${next.id}`)?.focus();
  };

  return (
    <div data-testid="workspace-agent-layout" className="flex min-h-0 flex-1 flex-col">
      <div
        className={
          previewMode
            ? "flex min-h-0 flex-1 flex-col"
            : "workspace-agent-grid grid min-h-0 flex-1 grid-cols-[minmax(330px,42%)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]"
        }
      >
        {!previewMode && (
          <section
            id="workspace-pane-conversation"
            role="tabpanel"
            aria-label="Conversation"
            data-testid="workspace-conversation-pane"
            className="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col border-r border-[var(--border-static)] bg-[var(--surface-panel)]"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-[18px]">{conversation}</div>
          </section>
        )}
        <section
          id={previewMode ? undefined : "workspace-pane-canvas"}
          role="tabpanel"
          aria-label="Visual workspace"
          data-testid="workspace-canvas-pane"
          className={`flex min-h-0 min-w-0 flex-col ${previewMode ? "" : "col-start-2 row-span-2 row-start-1 overflow-y-auto px-[22px] pb-[22px] pt-[18px]"}`}
        >
          <div data-testid="workspace-canvas-viewport" className="shrink-0">
            {canvas}
          </div>
          <div
            data-testid="workspace-inspector"
            className="flex shrink-0 flex-col border-t border-[var(--border-static)]"
          >
            <div role="tablist" aria-label="Workspace inspector" onKeyDown={handleInspectorKeyDown} className="flex shrink-0 gap-1 pt-[15px] pb-3 text-xs">
              {INSPECTOR_TABS.map(tab => (
                <button
                  key={tab.id}
                  id={`workspace-inspector-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={inspectorPanel === tab.id}
                  aria-controls={`workspace-inspector-panel-${tab.id}`}
                  tabIndex={inspectorPanel === tab.id ? 0 : -1}
                  onClick={() => onInspectorPanelChange(tab.id)}
                  className={`rounded-[10px] border border-[var(--border-static)] px-[11px] py-[7px] transition focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] ${inspectorPanel === tab.id ? "bg-[var(--accent-primary-soft)] font-medium text-[var(--accent-primary)] ring-1 ring-[var(--border-interactive)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              <div id="workspace-inspector-panel-evidence" role="tabpanel" aria-label="Evidence" hidden={inspectorPanel !== "evidence"}>{inspectorPanels.evidence}</div>
              <div id="workspace-inspector-panel-draft" role="tabpanel" aria-label="Draft" hidden={inspectorPanel !== "draft"}>{inspectorPanels.draft}</div>
              <div id="workspace-inspector-panel-prompt" role="tabpanel" aria-label="Prompt" hidden={inspectorPanel !== "prompt"}>{inspectorPanels.prompt}</div>
            </div>
          </div>
        </section>
        {!previewMode && (
          <section
            aria-label="Composer and generation bar"
            data-testid="workspace-composer-area"
            className="col-start-1 row-start-2 max-h-[55dvh] shrink-0 overflow-y-auto border-r border-t border-[var(--border-static)] bg-[var(--surface-panel)] px-[18px] pb-[18px] pt-[14px]"
          >
            {composer}
          </section>
        )}
      </div>
    </div>
  );
}

export interface DraftInspectorData {
  revision: number | null;
  saveState: string;
  intent?: string | null;
  detailLevel?: string | null;
  variables: { name: string; value: string }[];
  enabledRules: string[];
  constraints: string[];
  negativePrompt: string;
  prompt?: string;
  params: { model: string; aspectRatio: string; quality: string } | null;
  aspectRatioSource?: string | null;
  proposalPending?: boolean;
}

const SAVE_STATE_COPY: Record<string, string> = {
  saved: "Saved to this direction",
  saving: "Saving…",
  unavailable: "Not saved on this device",
  loading: "Restoring…",
};

/** plan-11（PRD §3.3.20）：Draft 检查页签——先内容变量，再意图与保留规则；只读呈现当前草稿事实。 */
export function DraftInspectorPanel({
  revision,
  saveState,
  intent,
  detailLevel,
  variables,
  enabledRules,
  constraints,
  negativePrompt,
  prompt,
  params,
  aspectRatioSource,
  proposalPending,
}: DraftInspectorData) {
  const saveCopy = SAVE_STATE_COPY[saveState] ?? "Local draft (not submitted)";
  return (
    <div data-testid="draft-inspector" data-revision={revision ?? "none"} data-save-state={saveState} className="space-y-2 py-2 text-xs text-[var(--text-primary)]">
      <p className="text-[var(--text-secondary)]">
        {revision === null ? "No direction yet. " : `Draft revision ${revision}. `}
        {saveCopy}. Changes affect the next image.
      </p>
      <section aria-label="Content variables" className="space-y-1">
        <h4 className="font-semibold">Content variables</h4>
        {variables.length > 0 ? (
          <dl className="space-y-1">
            {variables.map(variable => (
              <div key={variable.name} className="flex min-w-0 flex-wrap gap-1">
                <dt className="min-w-16 font-medium">{variable.name}:</dt>
                <dd className="min-w-0 flex-1 break-words">{variable.value || "(Not set)"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[var(--text-secondary)]">Not available</p>
        )}
      </section>
      <section aria-label="Intent and preservation rules" className="space-y-1">
        <h4 className="font-semibold">Intent and rules</h4>
        <p>Intent: {intent ?? "Not available"}{detailLevel ? ` · Detail: ${detailLevel}` : ""}</p>
        {constraints.length > 0 && (
          <ul className="list-inside list-disc">
            {constraints.map(constraint => <li key={constraint} className="break-words">{constraint}</li>)}
          </ul>
        )}
        {enabledRules.length > 0 ? (
          <ul className="list-inside list-disc" aria-label="Enabled style rules">
            {enabledRules.map(rule => <li key={rule} className="break-words">{rule}</li>)}
          </ul>
        ) : (
          <p className="text-[var(--text-secondary)]">No style rules enabled.</p>
        )}
      </section>
      <section aria-label="Generation context" className="space-y-1">
        <h4 className="font-semibold">Generation context</h4>
        {prompt && <p className="whitespace-pre-wrap break-words">Current prompt: {prompt}</p>}
        {params ? (
          <p>{params.model} · {params.aspectRatio} · {params.quality} · 1 image · Aspect ratio source: {aspectRatioSource ?? "fallback"}</p>
        ) : (
          <p className="text-[var(--text-secondary)]">Not available</p>
        )}
        <p className="break-words">Negative prompt: {negativePrompt || "None"}</p>
      </section>
      {proposalPending && (
        <p role="status" className="text-[var(--text-secondary)]">A proposal is waiting for your review. This draft has not changed.</p>
      )}
    </div>
  );
}
