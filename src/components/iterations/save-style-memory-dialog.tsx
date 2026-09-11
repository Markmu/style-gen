"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { deriveStyleMemoryPrefill } from "@/lib/style-memory-prefill";
import type { MemorySaveFormSnapshot } from "@/lib/workspace/draft-store";
import type { StoredVisualRecipe, TemplateVariable } from "@/types/models";

/**
 * plan-06: 保存为 Style Memory 三步向导（架构 §6.3、§4.2-⑤、ADR-1/6）。
 *
 * 流程 A（`SaveStyleMemoryDialog`，宿主 iteration-detail-panel）：
 * 1. 并排参考图与本次结果 + "set as representative result"（默认不勾选，Q5 决策）；
 * 2. 确认核心保留规则 / 排除约束（逐条可勾选、编辑、增删，≤12 × 200）、
 *    可替换变量及默认值（同屏可编辑）+ 风格指纹 / 增强方向只读快照
 *    （缺失组显示"本次迭代无 X"，不推测补齐）；
 * 3. 命名（1-50，中性帮助，提交/失焦才报错）、说明、高级信息折叠预览
 *    完整提示（promptSnapshot 可编辑）；"保存后状态"随勾选即时联动。
 *
 * 流程 B（`TemplateSaveDialog` 复用 `StyleMemorySaveWizard`）：跳过步骤 1，
 * 首屏固定"当前没有代表结果，本次将保存为 pending verification"说明，状态固定 pending。
 *
 * 提交 POST /api/templates 扩展体（SaveStyleMemoryRequest）：不携带
 * verificationStatus（ADR-1 服务端派生）；进行中锁定全部按钮防重复提交；
 * 409 展示服务端文案（引导改名），5xx/网络错误可重试，失败期间全部
 * 步骤内容、勾选与当前步骤保留；成功 router.push 新 Memory 详情。
 */

const MAX_NAME_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_CONTENT_LENGTH = 10_000;
const MAX_RULE_ITEMS = 12;
const MAX_RULE_LENGTH = 200;

/** 保存成功回调载荷（宿主局部联动所需的最小字段） */
export interface SavedStyleMemory {
  id: string;
  name: string;
}

/**
 * plan-10（架构 §6.5 / AC-18/AC-21）：保存向导与方向的幂等保存协作。
 * - keyFor(fingerprint)：同指纹未确认意图复用原 requestKey；
 * - onOutcome：未知/失败时把表单快照本机持久（不称已同步）；
 * - onCommitted：服务端确认后记录 committedMemoryId，再由宿主刷新回读。
 */
export interface StyleMemorySaveCoordinator {
  directionId: string | null;
  /** 未确认意图的表单快照（unknown/failed 时存在）；打开向导时恢复 */
  restoreForm: MemorySaveFormSnapshot | null;
  keyFor(fingerprint: string): string;
  onOutcome(state: "unknown" | "failed", form: MemorySaveFormSnapshot): void;
  onCommitted(memoryId: string): void;
}

export interface StyleMemorySaveWizardProps {
  open: boolean;
  /** 流程 A = 从完成 Iteration 保存（三步）；流程 B = 工作区草稿（两步，无代表结果） */
  flow: "iteration" | "workspace-draft";
  /** 完整提示预填（流程 A promptSnapshot / 流程 B 当前提示内容），步骤 3 可编辑 */
  initialContent: string;
  initialName?: string;
  /** 可替换变量预填（默认值步骤 2 可编辑，随提交体携带） */
  initialVariables: TemplateVariable[];
  /** 来源配方与来源标记（预填四元组依据） */
  recipe: StoredVisualRecipe | null;
  recipeSource: "snapshot" | "fallback" | "missing";
  /**
   * V1 配方无排除约束：由调用方传入保存来源的负面提示文本（流程 A
   * negativePromptSnapshot / 流程 B negativePromptText），非空整体作为一条。
   */
  negativePromptText?: string | null;
  /** 流程 A 步骤 1 参考图（详情 sourceImageUrl）；缺失显示占位 */
  referenceImageUrl?: string | null;
  /** 流程 A 步骤 1 本次结果图（详情 resultFileUrl） */
  resultImageUrl?: string | null;
  /** 来源资产 id（有参考图时随提交体携带） */
  sourceAssetId?: string | null;
  /** 流程 A：来源迭代 id（frontend_computed，ADR-5 反向关联） */
  sourceGenerationTaskId?: string | null;
  /** 流程 B：来源分析任务 id（既有工作台链路） */
  sourceAnalysisTaskId?: string | null;
  /** 流程 B：来源图 URL 快照（既有工作台链路，随 sourceAssetId 一并携带） */
  sourceImageUrl?: string | null;
  /**
   * plan-06：打开时预选「Set as representative result」。工作台 preferred
   * 入口传 true；第 14 期 iteration-detail 入口缺省 false（语义保持不变）。
   */
  defaultRepresentative?: boolean;
  /** 保存成功：携带 201 响应的 { id, name }（向导负责跳转新详情） */
  onSaved?: (template: SavedStyleMemory) => void;
  /** plan-10：方向幂等保存协作；缺省时保持既有无键行为 */
  saveCoordinator?: StyleMemorySaveCoordinator | null;
  /** plan-10：保存成功后跳转新 Memory 详情；工作区草稿流程留在当前方向 */
  navigateOnSave?: boolean;
  onClose: () => void;
}

type WizardStep = 1 | 2 | 3;

interface EditableRuleListProps {
  entries: string[];
  kept: boolean[];
  disabled: boolean;
  /** 组名（如 "核心保留规则"），用于可访问命名与缺失标记文案 */
  itemNoun: string;
  addLabel: string;
  missing: boolean;
  onEntriesChange: (entries: string[]) => void;
  onKeptChange: (kept: boolean[]) => void;
}

/**
 * 步骤 2 可编辑规则列表：逐条可勾选（勾选=随提交保留）/编辑/删除，可追加。
 * 条目文本以纯文本节点渲染（快照可读、按纯文本渲染，架构 §8.3）。
 */
function EditableRuleList({
  entries,
  kept,
  disabled,
  itemNoun,
  addLabel,
  missing,
  onEntriesChange,
  onKeptChange,
}: EditableRuleListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setDraft(entries[index] ?? "");
  };

  const commitEdit = (index: number) => {
    const next = entries.map((entry, i) =>
      i === index ? draft.trim().slice(0, MAX_RULE_LENGTH) : entry,
    );
    onEntriesChange(next);
    setEditingIndex(null);
  };

  const removeEntry = (index: number) => {
    onEntriesChange(entries.filter((_, i) => i !== index));
    onKeptChange(kept.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const addEntry = () => {
    if (entries.length >= MAX_RULE_ITEMS) return;
    onEntriesChange([...entries, ""]);
    onKeptChange([...kept, true]);
    startEdit(entries.length);
  };

  if (missing && entries.length === 0) {
    return (
      <p className="text-[0.6875rem] leading-5 text-[var(--text-muted)]">
        No {itemNoun} from this iteration
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {entries.map((entry, index) => (
          <li
            key={`${itemNoun}-${index}`}
            className="flex items-start gap-2 rounded-lg border border-[var(--border-static)] bg-[var(--surface-floating)] px-2.5 py-2 shadow-2xs"
          >
            <input
              type="checkbox"
              checked={kept[index] ?? true}
              disabled={disabled}
              onChange={(event) =>
                onKeptChange(
                  kept.map((value, i) => (i === index ? event.target.checked : value)),
                )
              }
              aria-label={`${itemNoun} ${index + 1}${entry ? `: ${entry}` : ""}`}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent-primary)]"
            />
            {editingIndex === index ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  type="text"
                  value={draft}
                  disabled={disabled}
                  autoFocus
                  maxLength={MAX_RULE_LENGTH}
                  aria-label={`Edit ${itemNoun} ${index + 1}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitEdit(index);
                    }
                  }}
                  className="input-precision min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => commitEdit(index)}
                  className="btn-secondary rounded-md px-2 py-1 text-[0.6875rem] font-medium"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-1.5">
                <span className="min-w-0 flex-1 break-words text-xs leading-5 text-[var(--text-primary)]">
                  {entry || "(empty)"}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => startEdit(index)}
                  aria-label={`Edit ${itemNoun} ${index + 1}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  <AppIcon icon={Pencil} size={13} />
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeEntry(index)}
              aria-label={`Delete ${itemNoun} ${index + 1}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--color-error)]"
            >
              <AppIcon icon={Trash2} size={13} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled || entries.length >= MAX_RULE_ITEMS}
        onClick={addEntry}
        className="btn-secondary inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-medium"
      >
        <AppIcon icon={Plus} size={13} />
        {addLabel}
      </button>
    </div>
  );
}

/** 只读快照 chip 组（风格指纹 / 增强方向） */
function SnapshotChips({
  values,
  missing,
  itemNoun,
}: {
  values: string[];
  missing: boolean;
  itemNoun: string;
}) {
  if (missing) {
    return (
      <p className="text-[0.6875rem] leading-5 text-[var(--text-muted)]">
        No {itemNoun} from this iteration
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <li
          key={value}
          className="rounded-full border border-[var(--border-static)] bg-[var(--surface-control)] px-2.5 py-0.5 text-[0.6875rem] font-medium text-[var(--text-secondary)] shadow-2xs"
        >
          {value}
        </li>
      ))}
    </ul>
  );
}

/** 步骤 1 参考图：缺失或加载失败显示占位说明（旧数据边界，架构 §6.4） */
function WizardReferenceImage({
  referenceImageUrl,
  promptHint,
}: {
  referenceImageUrl: string | null;
  promptHint: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!referenceImageUrl || failed) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)] px-3 text-center">
        <AppIcon icon={ImageIcon} size={18} className="text-[var(--text-muted)]" />
        <span className="text-[0.6875rem] leading-4 text-[var(--text-secondary)]">
          Source image missing
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-static)] bg-[var(--surface-media)] shadow-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={referenceImageUrl}
        alt={`Reference: ${promptHint}`}
        onError={() => setFailed(true)}
        className="aspect-[4/3] w-full object-cover"
      />
    </div>
  );
}

export function StyleMemorySaveWizard({
  open,
  flow,
  initialContent,
  initialName,
  initialVariables,
  recipe,
  recipeSource,
  negativePromptText,
  referenceImageUrl,
  resultImageUrl,
  sourceAssetId,
  sourceGenerationTaskId,
  sourceAnalysisTaskId,
  sourceImageUrl,
  defaultRepresentative = false,
  onSaved,
  saveCoordinator = null,
  navigateOnSave = true,
  onClose,
}: StyleMemorySaveWizardProps) {
  const router = useRouter();
  const titleId = "save-style-memory-dialog-title";
  const isIterationFlow = flow === "iteration";
  const firstStep: WizardStep = isIterationFlow ? 1 : 3;
  const totalSteps = isIterationFlow ? 3 : 1;

  const prefill = useMemo(
    () =>
      deriveStyleMemoryPrefill({
        recipe,
        recipeSource,
        negativePromptText,
      }),
    [recipe, recipeSource, negativePromptText],
  );

  const [step, setStep] = useState<WizardStep>(firstStep);
  const [isRepresentative, setIsRepresentative] = useState(false);
  // 步骤 2：规则/排除（文本 + 勾选）与变量默认值
  const [rules, setRules] = useState<string[]>([]);
  const [rulesKept, setRulesKept] = useState<boolean[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [constraintsKept, setConstraintsKept] = useState<boolean[]>([]);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  // 步骤 3：命名 / 说明 / 高级信息（完整提示）
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [content, setContent] = useState(initialContent);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveUnknown, setSaveUnknown] = useState(false);
  const coordinatorRef = useRef(saveCoordinator);
  coordinatorRef.current = saveCoordinator;

  const displayedStepNumber = isIterationFlow ? step : step - 1;

  const promptHint = useMemo(() => content.slice(0, 120), [content]);

  // 打开时（或切换来源）以该次来源快照重置向导（沿用现有 useEffect 重置模式）；
  // plan-06：代表结果预选随来源入口（工作台 preferred 传 true，缺省不勾选）
  const sourceKey = sourceGenerationTaskId ?? sourceAnalysisTaskId ?? "";
  useEffect(() => {
    if (!open) return;
    setStep(firstStep);
    setIsRepresentative(Boolean(defaultRepresentative));
    setRules(prefill.retainedRules);
    setRulesKept(prefill.retainedRules.map(() => true));
    setConstraints(prefill.negativeConstraints);
    setConstraintsKept(prefill.negativeConstraints.map(() => true));
    setVariables(initialVariables);
    setName(isIterationFlow ? "" : (initialName?.trim() || prefill.styleTokens.find((tag) => tag.trim()) || "Untitled style").slice(0, MAX_NAME_LENGTH));
    setAdjustOpen(false);
    setNameTouched(false);
    setDescription("");
    setContent(initialContent);
    setAdvancedOpen(false);
    setIsSaving(false);
    setError(null);
    setSaveUnknown(false);
    // plan-10：未确认意图的表单快照恢复（取消/刷新后表单不丢）
    const restore = coordinatorRef.current?.restoreForm ?? null;
    if (restore) {
      setName(restore.name);
      setDescription(restore.description);
      setContent(restore.content);
      setRules(restore.retainedRules.map((item) => item.text));
      setRulesKept(restore.retainedRules.map((item) => item.kept));
      setConstraints(restore.constraints.map((item) => item.text));
      setConstraintsKept(restore.constraints.map((item) => item.kept));
      if (restore.variables.length > 0) {
        setVariables(
          restore.variables.map((item) => ({ ...item }) as TemplateVariable),
        );
      }
      setIsRepresentative(restore.isRepresentative);
    }
    // 重置语义依赖打开动作与来源身份，预填/初始值按当次渲染取值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceKey, firstStep, defaultRepresentative]);

  const trimmedName = name.trim();
  const isNameEmpty = trimmedName.length === 0;
  const showNameError = nameTouched && isNameEmpty;

  const representativeEnabled = Boolean(sourceGenerationTaskId);
  const expectedVerified = isIterationFlow && isRepresentative && representativeEnabled;

  const retainedRulesToSubmit = useMemo(
    () =>
      rules
        .filter((_, index) => rulesKept[index] ?? true)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    [rules, rulesKept],
  );
  const constraintsToSubmit = useMemo(
    () =>
      constraints
        .filter((_, index) => constraintsKept[index] ?? true)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    [constraints, constraintsKept],
  );

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const handleSubmit = async () => {
    if (isSaving) return;
    setNameTouched(true);
    if (isNameEmpty) return;

    setIsSaving(true);
    setError(null);
    setSaveUnknown(false);
    const coordinator = coordinatorRef.current;

    const body: Record<string, unknown> = {
      name: trimmedName,
      ...(description.trim() ? { description: description.trim() } : {}),
      content,
      variables: variables.map((variable) => ({ ...variable })),
      retainedRules: retainedRulesToSubmit,
      negativeConstraints: constraintsToSubmit,
      styleTokens: prefill.styleTokens,
      enhancementHints: prefill.enhancementHints,
      ...(sourceAssetId ? { sourceAssetId } : {}),
    };
    if (isIterationFlow) {
      // 流程 A：来源迭代始终携带；代表结果仅勾选时携带（须等于来源迭代）
      if (sourceGenerationTaskId) body.sourceGenerationTaskId = sourceGenerationTaskId;
      if (expectedVerified && sourceGenerationTaskId) {
        body.representativeGenerationTaskId = sourceGenerationTaskId;
      }
    } else {
      // 流程 B：不带 representative / sourceGenerationTask（架构 §6.3 A/B 差异）；
      // 既有工作台链路继续携带来源分析任务与来源图快照（须与来源资产同现）
      if (sourceAnalysisTaskId) body.sourceAnalysisTaskId = sourceAnalysisTaskId;
      if (sourceAssetId && sourceImageUrl) body.sourceImageUrl = sourceImageUrl;
    }

    // plan-10（AC-18）：请求体指纹（不含键）决定 requestKey 复用；换内容才换键
    let requestKey: string | null = null;
    if (coordinator?.directionId) {
      requestKey = coordinator.keyFor(JSON.stringify(body));
      body.requestKey = requestKey;
      body.directionId = coordinator.directionId;
    }
    const formSnapshot: MemorySaveFormSnapshot = {
      name,
      description,
      content,
      retainedRules: rules.map((text, index) => ({ text, kept: rulesKept[index] ?? true })),
      constraints: constraints.map((text, index) => ({ text, kept: constraintsKept[index] ?? true })),
      variables: variables.map((variable) => ({ ...variable })),
      isRepresentative,
    };
    const finishCommitted = (memoryId: string, memoryName?: string) => {
      coordinator?.onCommitted(memoryId);
      onSaved?.({ id: memoryId, name: memoryName || trimmedName });
      if (navigateOnSave) router.push(`/workspace/templates/${memoryId}`);
    };

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 201 || res.status === 200) {
        const template = (await res.json()) as SavedStyleMemory;
        finishCommitted(template.id, template.name);
        return;
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        // 同名冲突：展示服务端文案，聚焦名称字段引导改名
        setError(data.error ?? "A Style Memory with this name already exists. Choose a different name and try again.");
      } else {
        setError(data.error ?? "Saving is temporarily unavailable. Please try again later.");
      }
      coordinator?.onOutcome("failed", formSnapshot);
    } catch {
      // plan-10：响应丢失为未知结果——先按同键查命令回执（只读），不盲目重建
      if (requestKey && coordinator?.directionId) {
        try {
          const check = await fetch(
            `/api/workspace/directions/${coordinator.directionId}/events?requestKey=${encodeURIComponent(`memory:${requestKey}`)}`,
          );
          const receipt = check.ok
            ? ((await check.json()) as { event?: { memoryId?: string } | null })
            : { event: null };
          if (receipt?.event?.memoryId) {
            finishCommitted(receipt.event.memoryId);
            return;
          }
        } catch {
          // 回执查询本身失败：按未知处理，保留表单与原键
        }
        setSaveUnknown(true);
        coordinator.onOutcome("unknown", formSnapshot);
      } else {
        setError("Network error. Saving is temporarily unavailable. Check your connection and try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={handleClose}
      label="Save as Style Memory"
      labelledBy={titleId}
      testId="save-style-memory-dialog"
      initialFocusRef={isIterationFlow ? undefined : nameRef}
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden pr-2">
        <div className="shrink-0 border-b border-[var(--border-static)] bg-[var(--surface-panel)] px-5 py-4 pr-14">
          <p className="label-tech text-[var(--text-muted)]">Save direction</p>
          <h2
            id={titleId}
            className="mt-0.5 text-lg font-semibold tracking-[-0.015em] text-[var(--text-primary)]"
          >
            Save as Style Memory
          </h2>
          {isIterationFlow && <p className="mt-1 font-mono text-[0.6875rem] tracking-wide text-[var(--text-muted)]">
            Step {displayedStepNumber} / {totalSteps}
          </p>}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          {/* 流程 B 首屏说明区：无代表结果，将保存为 pending verification（固定预期，ADR-1） */}
          {!isIterationFlow && (
            <div
              data-testid="save-wizard-no-representative-note"
              className="rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]/60 px-3.5 py-2.5 text-xs leading-5 text-[var(--text-secondary)]"
            >
              Not tested with a render yet. You can still reuse this style.
            </div>
          )}

          {/* 步骤 1（仅流程 A）：并排参考图与本次结果 + set-as-representative 勾选 */}
          {isIterationFlow && step === 1 && (
            <section data-testid="save-wizard-step-1" className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <figure className="min-w-0">
                  <WizardReferenceImage
                    referenceImageUrl={referenceImageUrl ?? null}
                    promptHint={promptHint}
                  />
                  <figcaption className="mt-1.5 text-center font-mono text-[0.625rem] uppercase tracking-wider text-[var(--text-muted)]">
                    Reference
                  </figcaption>
                </figure>
                <figure className="min-w-0">
                  <div className="overflow-hidden rounded-xl border border-[var(--border-static)] bg-[var(--surface-media)] shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resultImageUrl ?? ""}
                      alt={`Result from this iteration: ${promptHint}`}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  </div>
                  <figcaption className="mt-1.5 text-center font-mono text-[0.625rem] uppercase tracking-wider text-[var(--text-muted)]">
                    Result
                  </figcaption>
                </figure>
              </div>

              <label className="flex items-start gap-2.5 rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]/50 px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={isRepresentative}
                  disabled={isSaving || !representativeEnabled}
                  onChange={(event) => setIsRepresentative(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-primary)]"
                />
                <span className="text-xs leading-5 text-[var(--text-primary)]">
                  <span className="font-semibold">Set as representative result</span>
                  <span className="mt-0.5 block text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
                    When checked and saved, this memory is marked as User
                    verified; left unchecked, it is saved as Pending
                    verification.
                  </span>
                </span>
              </label>
            </section>
          )}

          {/* 步骤 2：规则四元组确认 + 变量默认值（两流程共用） */}
          {(step === 2 || (!isIterationFlow && adjustOpen)) && (
            <section data-testid="save-wizard-step-2" className="space-y-5">
              <div className="space-y-2">
                <p className="label-tech text-[0.6875rem] text-[var(--text-secondary)]">
                  Retained rules (checked items are kept with the memory; editable)
                </p>
                <EditableRuleList
                  entries={rules}
                  kept={rulesKept}
                  disabled={isSaving}
                  itemNoun="retained rule"
                  addLabel="Add retained rule"
                  missing={prefill.missing.includes("rules")}
                  onEntriesChange={setRules}
                  onKeptChange={setRulesKept}
                />
              </div>

              <div className="space-y-2">
                <p className="label-tech text-[0.6875rem] text-[var(--text-secondary)]">
                  Constraints (checked items are kept with the memory; editable)
                </p>
                <EditableRuleList
                  entries={constraints}
                  kept={constraintsKept}
                  disabled={isSaving}
                  itemNoun="constraint"
                  addLabel="Add constraint"
                  missing={prefill.missing.includes("constraints")}
                  onEntriesChange={setConstraints}
                  onKeptChange={setConstraintsKept}
                />
              </div>

              <div className="space-y-2">
                <p className="label-tech text-[0.6875rem] text-[var(--text-secondary)]">
                  Variables and default values (defaults are editable and submitted with the save)
                </p>
                {variables.length === 0 ? (
                  <p className="text-[0.6875rem] leading-5 text-[var(--text-muted)]">
                    No variables from this iteration
                  </p>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {variables.map((variable) => (
                      <div
                        key={variable.name}
                        className="space-y-1.5 rounded-lg border border-[var(--border-static)] bg-[var(--surface-floating)] p-2.5 shadow-2xs"
                      >
                        <label
                          htmlFor={`save-wizard-variable-${variable.name}`}
                          className="label-tech text-[0.625rem] text-[var(--text-muted)]"
                        >
                          {variable.label || variable.name}
                        </label>
                        <input
                          id={`save-wizard-variable-${variable.name}`}
                          type="text"
                          value={variable.defaultValue}
                          disabled={isSaving}
                          maxLength={500}
                          onChange={(event) =>
                            setVariables((current) =>
                              current.map((item) =>
                                item.name === variable.name
                                  ? { ...item, defaultValue: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="input-precision w-full rounded-lg px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="label-tech text-[0.6875rem] text-[var(--text-secondary)]">
                  Style fingerprint (read-only snapshot, submitted with the save)
                </p>
                <SnapshotChips
                  values={prefill.styleTokens}
                  missing={prefill.missing.includes("tokens")}
                  itemNoun="style fingerprint"
                />
              </div>

              <div className="space-y-2">
                <p className="label-tech text-[0.6875rem] text-[var(--text-secondary)]">
                  Enhancement hints (read-only snapshot, submitted with the save)
                </p>
                <SnapshotChips
                  values={prefill.enhancementHints}
                  missing={prefill.missing.includes("enhancements")}
                  itemNoun="enhancement hint"
                />
              </div>
            </section>
          )}

          {/* 步骤 3：命名 / 说明 / 高级信息（完整提示）+ 保存后状态 */}
          {step === 3 && (
            <section data-testid="save-wizard-step-3" className={!isIterationFlow ? "order-first space-y-4" : "space-y-5"}>
              {!isIterationFlow && <div className="flex items-center gap-3">
                <div className="w-20 shrink-0"><WizardReferenceImage referenceImageUrl={sourceImageUrl ?? null} promptHint="Source image" /></div>
                <div className="min-w-0 text-xs text-[var(--text-secondary)]">
                  <p>{retainedRulesToSubmit.length} retained rules, {constraintsToSubmit.length} constraints, {variables.length} variables</p>
                  {retainedRulesToSubmit.length > 0 && (
                    <ul aria-label="Saved style summary" className="mt-2 space-y-1">
                      {retainedRulesToSubmit.slice(0, 2).map((rule, index) => (
                        <li key={index} className="line-clamp-2">{rule}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>}
              <div className="space-y-1.5">
                <label
                  htmlFor="save-wizard-name"
                  className="label-tech text-[0.6875rem] text-[var(--text-secondary)]"
                >
                  Name
                </label>
                <input
                  ref={nameRef}
                  id="save-wizard-name"
                  type="text"
                  value={name}
                  disabled={isSaving}
                  maxLength={MAX_NAME_LENGTH}
                  aria-invalid={showNameError}
                  placeholder="e.g. Neon dusk direction"
                  onChange={(event) => {
                    setName(event.target.value);
                    if (event.target.value.trim().length > 0) setNameTouched(false);
                    setError(null);
                  }}
                  onBlur={() => setNameTouched(true)}
                  className="input-precision w-full rounded-lg px-3.5 py-2.5 text-sm"
                />
                <div className="flex items-start justify-between gap-3 text-xs">
                  {showNameError ? (
                    <p role="alert" className="text-[var(--color-error)]">
                      Name cannot be empty. Fill it in before saving.
                    </p>
                  ) : (
                    <p className="text-[0.6875rem] leading-5 text-[var(--text-muted)]">
                      Name is 1-50 characters and can be changed any time after saving.
                    </p>
                  )}
                  <p className="shrink-0 font-mono text-[0.6875rem] text-[var(--text-muted)]">
                    {name.length}/{MAX_NAME_LENGTH}
                  </p>
                </div>
                {/* 提交失败（409 同名 / 5xx / 网络）：服务端文案或可重试提示 */}
                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error-soft)] px-3.5 py-2.5 text-xs leading-5 text-[var(--color-error)]"
                  >
                    {error}
                  </p>
                )}
                {/* plan-10（AC-18）：响应未知——已查同键回执且不存在；原键重试不会重复 */}
                {saveUnknown && (
                  <div
                    data-testid="save-unknown-status"
                    role="status"
                    className="rounded-lg border border-[var(--border-interactive)] bg-[var(--surface-low)]/60 px-3.5 py-2.5 text-xs leading-5 text-[var(--text-secondary)]"
                  >
                    Saving did not complete. We checked your last request on
                    the server — it did not finish. Your form is kept here, not
                    synced. Retry uses the same request and will not create a
                    duplicate.
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="save-wizard-description"
                  className="label-tech text-[0.6875rem] text-[var(--text-secondary)]"
                >
                  Description (optional)
                </label>
                <textarea
                  id="save-wizard-description"
                  value={description}
                  disabled={isSaving}
                  rows={2}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  onChange={(event) => setDescription(event.target.value)}
                  className="input-precision w-full resize-y rounded-lg px-3 py-2 text-sm leading-6"
                />
              </div>

              <div className={!isIterationFlow && !adjustOpen ? "hidden" : "space-y-2"}>
                <button
                  type="button"
                  disabled={isSaving}
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((current) => !current)}
                  className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  {advancedOpen ? "Hide advanced (full prompt)" : "Advanced (full prompt)"}
                </button>
                {advancedOpen && (
                  <div className="space-y-2 rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]/50 p-3.5">
                    <label
                      htmlFor="save-wizard-content"
                      className="label-tech text-[0.625rem] text-[var(--text-muted)]"
                    >
                      Full prompt (editable, saved with the memory&apos;s advanced info)
                    </label>
                    <textarea
                      id="save-wizard-content"
                      value={content}
                      disabled={isSaving}
                      rows={6}
                      maxLength={MAX_CONTENT_LENGTH}
                      onChange={(event) => setContent(event.target.value)}
                      className="input-precision min-h-[8rem] w-full resize-y rounded-lg px-3 py-2.5 text-xs leading-6"
                    />
                    <p className="text-right font-mono text-[0.625rem] text-[var(--text-muted)]">
                      {content.length} / {MAX_CONTENT_LENGTH.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {!isIterationFlow && <button type="button" disabled={isSaving} aria-expanded={adjustOpen} onClick={() => setAdjustOpen(!adjustOpen)} className="btn-secondary rounded-lg px-3 py-2 text-xs">Adjust saved content</button>}
              {/* 保存后状态：唯一文本节点，随步骤 1 勾选即时联动（ADR-1 前端只展示预期） */}
              {isIterationFlow && <p
                data-testid="save-wizard-status-line"
                className="rounded-xl border border-[var(--border-static)] bg-[var(--surface-low)]/60 px-3.5 py-2.5 text-xs leading-5 text-[var(--text-primary)]"
              >
                After saving: {expectedVerified ? "User verified" : "Pending verification"}
              </p>}
            </section>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-[var(--border-static)] bg-[var(--surface-panel)] px-5 py-3.5">
          {isIterationFlow && step > firstStep && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setStep((current) => (current > firstStep ? ((current - 1) as WizardStep) : current))}
              className="btn-secondary rounded-lg px-3.5 py-2 text-xs font-medium"
            >
              Back
            </button>
          )}
          <button
            type="button"
            disabled={isSaving}
            onClick={handleClose}
            className="btn-secondary rounded-lg px-3.5 py-2 text-xs font-medium"
          >
            Cancel
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => setStep((current) => ((current + 1) as WizardStep))}
              className="btn-primary rounded-lg px-4 py-2 text-xs font-semibold tracking-wide"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
              className="btn-primary rounded-lg px-4 py-2 text-xs font-semibold tracking-wide"
            >
              {isSaving ? "Saving…" : "Save Style Memory"}
            </button>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}

/**
 * 流程 A：从完成 Iteration 保存为 Style Memory（宿主 iteration-detail-panel）。
 * 宿主按 IterationDetail 实际字段传参：promptSnapshot / recipe + recipeSource /
 * variables / negativePromptSnapshot / sourceAssetId / id（→ sourceGenerationTaskId）/
 * sourceImageUrl（参考图）/ resultFileUrl（本次结果）。
 */
export interface SaveStyleMemoryDialogProps {
  open: boolean;
  /** 来源迭代完整提示（步骤 3 高级信息预填） */
  promptSnapshot: string;
  /** 来源迭代固化的变量（步骤 2 默认值预填） */
  variables: TemplateVariable[];
  /** 来源迭代负面提示快照（V1 配方排除约束来源） */
  negativePromptSnapshot: string;
  /** 来源配方与来源标记 */
  recipe: StoredVisualRecipe | null;
  recipeSource: "snapshot" | "fallback" | "missing";
  /** 参考图 / 本次结果（步骤 1 并排展示） */
  sourceImageUrl: string | null;
  resultFileUrl: string | null;
  /** 来源资产 id（入口条件已保证非空） */
  sourceAssetId: string | null;
  /** 来源迭代 id（frontend_computed，ADR-5 反向关联） */
  sourceGenerationTaskId: string;
  /**
   * plan-06：工作台 preferred 入口传 true——打开即预选该完成结果为代表结果；
   * 第 14 期 iteration-detail 入口缺省不勾选（语义不变）。
   */
  defaultRepresentative?: boolean;
  /** 保存成功：携带 201 响应的 { id, name }，由宿主局部联动（向导负责跳转新详情） */
  onSaved: (template: SavedStyleMemory) => void;
  /** plan-10：方向幂等保存协作（requestKey 回执与表单恢复） */
  saveCoordinator?: StyleMemorySaveCoordinator | null;
  onClose: () => void;
}

export function SaveStyleMemoryDialog({
  open,
  promptSnapshot,
  variables,
  negativePromptSnapshot,
  recipe,
  recipeSource,
  sourceImageUrl,
  resultFileUrl,
  sourceAssetId,
  sourceGenerationTaskId,
  defaultRepresentative = false,
  onSaved,
  saveCoordinator = null,
  onClose,
}: SaveStyleMemoryDialogProps) {
  return (
    <StyleMemorySaveWizard
      open={open}
      flow="iteration"
      initialContent={promptSnapshot}
      initialVariables={variables}
      negativePromptText={negativePromptSnapshot}
      recipe={recipe}
      recipeSource={recipeSource}
      referenceImageUrl={sourceImageUrl}
      resultImageUrl={resultFileUrl}
      sourceAssetId={sourceAssetId}
      sourceGenerationTaskId={sourceGenerationTaskId}
      defaultRepresentative={defaultRepresentative}
      onSaved={onSaved}
      saveCoordinator={saveCoordinator}
      onClose={onClose}
    />
  );
}
