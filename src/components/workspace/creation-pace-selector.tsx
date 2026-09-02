"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gauge, PencilLine, Zap } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import type {
  CreationPace,
  QuickAuthorization,
  QuickGenerationAuthorizationSnapshot,
} from "@/types/models";

/** 确认区/生成设置展示共享的生成参数子集（不含 aspectRatio——由策略解析） */
export interface PaceGenerationSettings {
  quality: string;
  model: string;
}

interface CreationPaceSelectorProps {
  creationPace: CreationPace;
  quickAuthorization: QuickAuthorization;
  /** 与 Render Dock 消费的同一默认生成设置（确认披露同源） */
  generationSettings: PaceGenerationSettings;
  /** 授权清除原因（阻塞/失败/退出）；null 不渲染 */
  clearedReason: string | null;
  /** 确认快速复刻：拟保存快照与 armed 原子持久化（父级同步 flush） */
  onConfirmQuickRecreate: (snapshot: QuickGenerationAuthorizationSnapshot) => void;
  /** armed 期间退出快速路径（清授权并恢复可编辑） */
  onExitQuickRecreate: () => void;
  /** 选择「分析后编辑」；armed 期间等价退出快速路径 */
  onSelectAnalyzeEdit: () => void;
}

const AUTHORIZATION_LABELS: Record<QuickAuthorization, string> = {
  none: "Quick recreate off",
  armed: "Quick recreate armed — analysis will submit once automatically",
  consumed: "Quick recreate submitted — no further automatic renders",
};

/**
 * plan-02（架构 §3.1/§6.1、ADR-2）：创作节奏双入口与快速复刻确认区。
 * 确认内容直接从拟保存的 `QuickGenerationAuthorizationSnapshot` 渲染；
 * 取消零写入，焦点回触发器；armed 期间展示锁定说明与退出入口。
 */
export function CreationPaceSelector({
  creationPace,
  quickAuthorization,
  generationSettings,
  clearedReason,
  onConfirmQuickRecreate,
  onExitQuickRecreate,
  onSelectAnalyzeEdit,
}: CreationPaceSelectorProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const quickRecreateButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const confirmDialogRef = useRef<HTMLDivElement | null>(null);

  // 确认区渲染的拟保存快照：字面量 + 当前共享默认生成设置（同源，禁止复制默认常量）
  const proposedSnapshot: QuickGenerationAuthorizationSnapshot = {
    schemaVersion: 1,
    intent: "reconstruction",
    detailLevel: "standard",
    aspectRatioPolicy: "reference_or_fallback",
    generationSettings: {
      quality: generationSettings.quality,
      model: generationSettings.model,
    },
  };

  // 打开确认区时焦点进入标题（架构 §3.3：确认有确定焦点）
  useEffect(() => {
    if (confirmOpen) {
      titleRef.current?.focus();
    }
  }, [confirmOpen]);

  const closeConfirm = useCallback(() => {
    setConfirmOpen(false);
    quickRecreateButtonRef.current?.focus();
  }, []);

  const handleOpenConfirm = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirmQuickRecreate(proposedSnapshot);
    setConfirmOpen(false);
    quickRecreateButtonRef.current?.focus();
  }, [onConfirmQuickRecreate, proposedSnapshot]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape" && confirmOpen) {
        event.stopPropagation();
        closeConfirm();
      }
    },
    [closeConfirm, confirmOpen],
  );

  const isArmed = quickAuthorization === "armed";

  return (
    <section
      data-testid="creation-pace-selector"
      aria-label="Creation pace"
      className="mx-4 mb-3 rounded-xl bg-[var(--surface-low)]/72 p-2 ring-1 ring-[var(--border-static)]"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <AppIcon
          icon={Gauge}
          size={16}
          className="shrink-0 text-[var(--text-muted)]"
        />
        <div
          role="group"
          aria-label="Creation pace options"
          className="flex min-w-0 gap-1.5"
        >
          <button
            type="button"
            data-testid="pace-option-analyze-edit"
            aria-pressed={creationPace === "analyze_edit"}
            onClick={onSelectAnalyzeEdit}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
              creationPace === "analyze_edit"
                ? "bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]"
                : "bg-[var(--surface-control)] text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] hover:bg-[var(--surface-floating)]"
            }`}
          >
            <AppIcon icon={PencilLine} size={14} />
            <span>Analyze, then edit</span>
          </button>
          <button
            ref={quickRecreateButtonRef}
            type="button"
            data-testid="pace-option-quick-recreate"
            aria-pressed={creationPace === "quick_recreate"}
            onClick={handleOpenConfirm}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
              creationPace === "quick_recreate"
                ? "bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]"
                : "bg-[var(--surface-control)] text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] hover:bg-[var(--surface-floating)]"
            }`}
          >
            <AppIcon icon={Zap} size={14} />
            <span>Quick recreate</span>
          </button>
        </div>

        <span
          data-testid="quick-authorization-status"
          data-authorization={quickAuthorization}
          tabIndex={-1}
          role="status"
          className="min-w-0 truncate px-1 text-[0.6875rem] font-medium text-[var(--text-muted)]"
        >
          {AUTHORIZATION_LABELS[quickAuthorization]}
        </span>

        {isArmed && (
          <button
            type="button"
            data-testid="exit-quick-recreate"
            onClick={onExitQuickRecreate}
            className="ml-auto flex h-8 shrink-0 items-center rounded-lg bg-[var(--surface-control)] px-3 text-[0.6875rem] font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] transition-colors hover:bg-[var(--surface-floating)]"
          >
            Exit quick recreate
          </button>
        )}
      </div>

      {isArmed && (
        <p
          data-testid="quick-authorization-locked-note"
          className="mt-1.5 px-1 text-[0.6875rem] leading-5 text-[var(--text-secondary)]"
        >
          The automatic render will use the confirmed settings. Intent, detail,
          and generation settings are locked — exit quick recreate to edit them
          again.
        </p>
      )}

      {quickAuthorization === "none" && clearedReason && (
        <p
          data-testid="quick-authorization-cleared-reason"
          role="status"
          className="mt-1.5 px-1 text-[0.6875rem] leading-5 text-[var(--text-secondary)]"
        >
          {clearedReason}
        </p>
      )}

      {confirmOpen && (
        <div
          ref={confirmDialogRef}
          role="dialog"
          aria-labelledby="quick-confirm-title-text"
          data-testid="quick-confirm-dialog"
          className="mt-2 rounded-lg bg-[var(--surface-floating)] p-3 ring-1 ring-[var(--border-static)]"
        >
          <h2
            id="quick-confirm-title-text"
            data-testid="quick-confirm-title"
            tabIndex={-1}
            ref={titleRef}
            className="text-sm font-semibold text-[var(--text-primary)] outline-none"
          >
            Confirm quick recreate
          </h2>
          <p className="mt-1 text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
            After your reference is analyzed, one render is submitted
            automatically with exactly these settings.
          </p>
          <dl className="mt-2 grid gap-1.5 text-[0.6875rem] leading-5 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="shrink-0 font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Intent
              </dt>
              <dd
                data-testid="quick-confirm-intent"
                data-value={proposedSnapshot.intent}
                className="min-w-0 text-[var(--text-primary)]"
              >
                Close reconstruction
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Detail
              </dt>
              <dd
                data-testid="quick-confirm-detail-level"
                data-value={proposedSnapshot.detailLevel}
                className="min-w-0 text-[var(--text-primary)]"
              >
                Balanced
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Ratio
              </dt>
              <dd
                data-testid="quick-confirm-aspect-ratio-policy"
                data-value={proposedSnapshot.aspectRatioPolicy}
                className="min-w-0 text-[var(--text-primary)]"
              >
                Recommended from the reference; falls back to 1:1 when
                unreadable
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Settings
              </dt>
              <dd
                data-testid="quick-confirm-generation-settings"
                data-quality={proposedSnapshot.generationSettings.quality}
                data-model={proposedSnapshot.generationSettings.model}
                className="min-w-0 truncate text-[var(--text-primary)]"
              >
                Quality {proposedSnapshot.generationSettings.quality} · Model{" "}
                {proposedSnapshot.generationSettings.model}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="shrink-0 font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Images
              </dt>
              <dd
                data-testid="quick-confirm-image-count"
                data-value="1"
                className="min-w-0 text-[var(--text-primary)]"
              >
                Generates 1 image
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              data-testid="quick-confirm-cancel"
              onClick={closeConfirm}
              className="flex h-9 items-center rounded-lg bg-[var(--surface-control)] px-4 text-xs font-semibold text-[var(--text-secondary)] ring-1 ring-[var(--border-static)] transition-colors hover:bg-[var(--surface-floating)]"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="quick-confirm-confirm"
              onClick={handleConfirm}
              className="btn-primary flex h-9 items-center rounded-lg px-4 text-xs"
            >
              Confirm quick recreate
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
