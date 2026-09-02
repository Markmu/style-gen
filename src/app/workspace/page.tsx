"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { useFileStore } from "@/components/landing/use-file-store";
import {
  consumePendingIterationRestore,
  useWorkspaceState,
  type WorkspaceState,
} from "@/hooks/use-workspace-state";
import { MemoryIdentityBar } from "@/components/workspace/memory-identity-bar";
import { CreationPaceSelector } from "@/components/workspace/creation-pace-selector";
import { useUpload } from "@/hooks/use-upload";
import { useAnalysis } from "@/hooks/use-analysis";
import { useGeneration } from "@/hooks/use-generation";
import { useHistoryList } from "@/hooks/use-history-list";
import { useHistoryRestore, type RestoredData } from "@/hooks/use-history-restore";
import {
  directionIterationsQueryKey,
  useDirectionIterations,
} from "@/hooks/use-direction-iterations";
import { useIterationDetail } from "@/hooks/use-iteration-detail";
import { WorkspaceThreeColumnLayout } from "@/components/workspace/workspace-three-column-layout";
import { ReferenceCard } from "@/components/workspace/reference-card";
import { RecipeCard } from "@/components/workspace/recipe-card";
import { PromptCard } from "@/components/workspace/prompt-card";
import type { PromptCardControlsState } from "@/components/workspace/prompt-card";
import type { KeepChangeLocateTarget } from "@/components/workspace/keep-change-summary";
import { DirectionResultRail } from "@/components/workspace/direction-result-rail";
import type {
  DirectionMemoryStatus,
  PreferredInvalidNotice,
} from "@/components/workspace/direction-result-rail";
import { ResultComparisonPanel } from "@/components/workspace/result-comparison-panel";
import { ReplaceConfirmDialog } from "@/components/iterations/replace-confirm-dialog";
import { SaveStyleMemoryDialog } from "@/components/iterations/save-style-memory-dialog";
import {
  RepresentativeResultSelector,
  representativeCandidatesQueryKey,
} from "@/components/style-memory/representative-result-selector";
import { HistoryStrip } from "@/components/workspace/history-strip";
import { OutputCard } from "@/components/workspace/output-card";
import { WorkspaceBottomBar } from "@/components/workspace/workspace-bottom-bar";
import { AiCopilotRibbon } from "@/components/workspace/ai-copilot-ribbon";
import { WorkspaceTopBar } from "@/components/workspace/workspace-top-bar";
import {
  previewHistoryItems,
  previewNegativePrompt,
  previewPrompt,
  previewRecipe,
  previewReferenceImageUrl,
  previewTemplateContent,
  previewTemplateVariables,
} from "@/components/workspace/workspace-preview-data";
import {
  HistoryDetailDialog,
  type HistoryDetail,
} from "@/components/workspace/history-detail-dialog";
import type { AspectRatio, Quality } from "@/components/workspace/output-settings";
import { TemplateSaveDialog } from "@/components/workspace/template-save-dialog";
import { hasUnresolvedVariables } from "@/lib/template-parser";
import {
  deriveEvidenceFacets,
  type EvidenceFacetId,
} from "@/lib/evidence-facets";
import { derivePromptProvenanceSpans } from "@/lib/prompt-provenance";
import { deriveRenderReadiness } from "@/lib/render-readiness";
import { composePromptDocument } from "@/lib/prompt-composer";
import {
  applyAdjustmentToCustomText,
  applyInvariantAdjustment,
  deriveKeepChangeSummary,
} from "@/lib/prompt-adjustments";
import { renderPromptTemplate } from "@/lib/visual-recipe";
import { resolveAspectRatio } from "@/lib/generation/aspect-ratio";
import {
  DEFAULT_IMAGE_GEN_MODEL_ID,
  isKnownImageGenModel,
} from "@/lib/ai/model-config";
import type {
  CompiledPromptSegment,
  GenerationParams,
  InvariantAdjustment,
  IterationDetail,
  PromptControlSnapshot,
  PromptDetailLevel,
  PromptEditorMode,
  PromptIntent,
  QuickGenerationAuthorizationSnapshot,
  StyleMemoryDetail,
  TemplateVariable,
  VisualRecipeV2Success,
} from "@/types/models";
import {
  isVisualRecipeV2Success,
  toLegacyVisualRecipe,
} from "@/lib/visual-recipe";

/** L1 degradation threshold: show queueing hint after 60s */
const QUEUEING_THRESHOLD_MS = 60_000;
/** plan-07：复用确认握手 URL 的最短可见窗口（ADR-5 可观察回落） */
const REUSE_HANDSHAKE_URL_DWELL_MS = 220;

/**
 * plan-05（ADR-7）：在下一帧聚焦选择器命中的元素；重试若干帧以覆盖
 * React 提交/条件渲染时序（取消回触发器、应用聚焦摘要项、其他聚焦全文）。
 */
function focusBySelector(selector: string, attempts = 12): void {
  let remaining = attempts;
  const attempt = () => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      element.focus();
      return;
    }
    if (remaining > 0) {
      remaining -= 1;
      requestAnimationFrame(attempt);
    }
  };
  requestAnimationFrame(attempt);
}
const EVIDENCE_COPILOT_PREVIEW = "evidence-copilot";
const previewDegradation = {
  analysisQueueing: false,
  generationQueueing: false,
  generationUnavailable: false,
  analysisUnavailable: false,
};

/**
 * L1 degradation: while `state` keeps polling in `activeState`, raise the
 * queueing flag once past QUEUEING_THRESHOLD_MS; reset it on any other state.
 */
function useQueueingDegradationTimer(
  state: WorkspaceState,
  activeState: "analyzing" | "generating",
  queueing: boolean,
  setQueueing: (queueing: boolean) => void,
): void {
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (state !== activeState) {
      startTimeRef.current = null;
      if (queueing) {
        setQueueing(false);
      }
      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    const timer = setInterval(() => {
      if (
        startTimeRef.current &&
        Date.now() - startTimeRef.current > QUEUEING_THRESHOLD_MS &&
        !queueing
      ) {
        setQueueing(true);
      }
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

interface RestoredSourceContext {
  sourceAnalysisTaskId: string | null;
  sourceAssetId: string | null;
  sourceImageUrl: string | null;
  variables: TemplateVariable[];
}

/** Get real image dimensions */
function getImageDimensions(
  file: File | string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Unable to load image"));
    };
    img.src = typeof file === "string" ? file : URL.createObjectURL(file);
  });
}

/** Parse API error response */
async function parseApiError(
  res: Response,
): Promise<{ error: string; code?: string; retryable?: boolean }> {
  try {
    const data = (await res.json()) as {
      error?: string;
      code?: string;
      retryable?: boolean;
    };
    return {
      error: data.error ?? "Request failed",
      code: data.code,
      retryable: data.retryable,
    };
  } catch {
    return { error: "Request failed" };
  }
}

function deriveHistoryStripStatus(options: {
  isPreview: boolean;
  isError: boolean;
  isLoading: boolean;
}): "idle" | "loading" | "error" {
  if (options.isPreview) return "idle";
  if (options.isError) return "error";
  if (options.isLoading) return "loading";
  return "idle";
}

/**
 * plan-02（架构 §6.1.5、ADR-2）：从授权快照 + Recipe 默认 invariants/variables/
 * modifiers 派生快速复刻的不可变请求材料。不读取 live 草稿——自动提交只消费
 * 确认快照与模型事实，避免 analysis effect 与界面编辑竞态。
 */
function deriveQuickRecreateSubmission(input: {
  recipe: VisualRecipeV2Success;
  authorization: QuickGenerationAuthorizationSnapshot;
}): {
  promptControlSnapshot: PromptControlSnapshot;
  promptText: string;
  negativePromptText: string;
} {
  const promptControlSnapshot: PromptControlSnapshot = {
    schemaVersion: 1,
    trigger: "quick_recreate",
    intent: input.authorization.intent,
    detailLevel: input.authorization.detailLevel,
    editorMode: "variables",
    customPromptDirty: false,
    enabledInvariantIds: input.recipe.styleInvariants.map((item) => item.id),
    variableValues: Object.fromEntries(
      input.recipe.contentVariables.map((variable) => [
        variable.name,
        variable.defaultValue,
      ]),
    ),
    enabledModifierNames: [],
    modifierValues: {},
    adjustments: [],
  };
  return {
    promptControlSnapshot,
    promptText: composePromptDocument(input.recipe, promptControlSnapshot).text,
    negativePromptText: input.recipe.negativeConstraints.join(", "),
  };
}

// ─── plan-06（架构 §6.6 / §6.7 / ADR-6）：首选验证、Memory 写点与新参考 ─────────

/** 读取一条 Iteration 详情（preferred 验证 / Memory 入口 / 守卫比较共用） */
async function fetchIterationDetailFor(iterationId: string): Promise<IterationDetail> {
  const res = await fetch(`/api/generation/${iterationId}`);
  if (!res.ok) throw new Error("Failed to load the iteration detail");
  return (await res.json()) as IterationDetail;
}

type PreferredValidation =
  | { outcome: "valid"; detail: IterationDetail }
  | { outcome: "invalid"; reason: string }
  | { outcome: "unavailable" };

/**
 * plan-06（架构 §6.7.1）：经 Iteration detail 验证 preferred——当前用户可
 * 访问、相同 analysisTaskId、completed 且有结果资产。结构性无效事实才判
 * invalid；详情暂时读不到（网络/5xx）按 unavailable 处理，不清除会话偏好。
 */
function validatePreferredDetail(
  detail: IterationDetail,
  currentAnalysisTaskId: string,
): PreferredValidation {
  if (detail.analysisTaskId !== currentAnalysisTaskId) {
    return { outcome: "invalid", reason: "该结果属于其他方向" };
  }
  if (detail.status !== "completed") {
    return { outcome: "invalid", reason: "该结果任务未完成" };
  }
  const resultAssetId = (detail as { resultAssetId?: string | null }).resultAssetId;
  if (!resultAssetId && !detail.resultFileUrl) {
    return { outcome: "invalid", reason: "该结果缺少图片资产" };
  }
  return { outcome: "valid", detail };
}

/** plan-06：来源 Memory 详情读取（与详情页共用 `style-memory-detail/{id}` key） */
async function fetchStyleMemoryDetail(
  memoryId: string,
  signal: AbortSignal,
): Promise<StyleMemoryDetail> {
  const res = await fetch(`/api/templates/${memoryId}`, { signal });
  if (!res.ok) throw new Error("Failed to load the Style Memory detail");
  return (await res.json()) as StyleMemoryDetail;
}

/**
 * plan-06（实现规格 §2）：Memory 写成功后的统一回读——templates 列表前缀。
 * 列表查询在列表页才有订阅；此处经 `fetchQuery` 以列表页同一 key
 * （useTemplateSearch 默认 `{search:"", status:"all"}`）回源读取，不另建缓存。
 */
async function fetchStyleMemoryListPage(signal: AbortSignal): Promise<unknown[]> {
  const res = await fetch("/api/templates?limit=20", { signal });
  if (!res.ok) throw new Error("Failed to read the Style Memory list");
  const data = (await res.json()) as { items?: unknown[] };
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * plan-06（架构 §6.6.2）：方向切换守卫的比较材料——当前草稿的 Prompt、
 * negative constraints、生成参数与当前来源，对照所选结果的提交快照，
 * 产出「将不带入新方向」的未完成内容说明。
 */
function buildNewReferenceUnfinishedSummary(input: {
  currentPromptText: string;
  currentNegativePromptText: string;
  currentParams: { aspectRatio: string; quality: string };
  targetDetail: IterationDetail | null;
}): string[] {
  const items: string[] = [];
  const detail = input.targetDetail;
  const promptDiffers =
    detail === null ||
    detail.promptSnapshot.trim() !== input.currentPromptText.trim();
  if (promptDiffers) {
    items.push("Prompt：当前草稿与所选结果的提交快照不同");
  }
  const negativeDiffers =
    detail === null ||
    detail.negativePromptSnapshot.trim() !== input.currentNegativePromptText.trim();
  if (negativeDiffers) {
    items.push("Negative constraints：当前排除约束与所选结果不同");
  }
  const paramsDiffer =
    detail === null ||
    detail.params.aspectRatio !== input.currentParams.aspectRatio ||
    detail.params.quality !== input.currentParams.quality;
  if (paramsDiffer) {
    items.push("生成参数：画幅或质量与所选结果不同");
  }
  items.push("当前参考来源将替换为该结果的图片资产（复用同一 Asset，不重新上传）");
  return items;
}

function WorkspacePageInner() {
  const fileStore = useFileStore();
  const ws = useWorkspaceState();
  const { upload, progress, isUploading } = useUpload();
  // plan-07：Memory 复用会话中，"进入时"既有的分析任务 id 仅作为生成上下文
  // 门控令牌（ADR-7），不再对其发起轮询——陈旧 id 的 401 会话过期分支会把
  // 用户甩出工作台。此后上传新参考图产生的新任务 id 照常轮询。
  const entryAnalysisTaskIdRef = useRef<string | null>(null);
  if (entryAnalysisTaskIdRef.current === null && ws.analysisTaskId) {
    entryAnalysisTaskIdRef.current = ws.analysisTaskId;
  }
  const memoryHoldsEntryAnalysisTask =
    !!ws.memoryIdentity &&
    ws.analysisTaskId !== null &&
    ws.analysisTaskId === entryAnalysisTaskIdRef.current;
  // plan-06：Iteration 恢复进入的既有分析任务 id 同样不参与轮询（与 plan-07
  // Memory 复用入口对称）。上传新参考图时 completeUpload 先离开恢复态、
  // startAnalysis 尚未写入新 id，这个窗口内若对陈旧恢复 id 发起轮询，其 401
  // 会话过期分支会把用户甩出工作台；新任务 id 产生后照常轮询。
  const restoredEntryAnalysisTaskIdRef = useRef<string | null>(null);
  if (
    restoredEntryAnalysisTaskIdRef.current === null &&
    ws.state === "history_restored" &&
    ws.analysisTaskId
  ) {
    restoredEntryAnalysisTaskIdRef.current = ws.analysisTaskId;
  }
  const holdsRestoredEntryAnalysisTask =
    ws.analysisTaskId !== null &&
    ws.analysisTaskId === restoredEntryAnalysisTaskIdRef.current;
  // plan-04: 恢复态（history_restored）不再轮询分析端点——快照已完整落地，
  // 轮询只会用过期分析结果覆盖恢复内容（或触发会话过期跳转）。
  // 上传新参考图/新分析开始后状态离开恢复态，轮询自然恢复。
  const { data: analysisData } = useAnalysis(
    ws.state === "history_restored" ||
      memoryHoldsEntryAnalysisTask ||
      holdsRestoredEntryAnalysisTask
      ? null
      : ws.analysisTaskId,
  );
  const { data: generationData } = useGeneration(ws.generationTaskId);
  const searchParams = useSearchParams();
  const browserPreviewParam =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("preview")
      : null;
  const isEvidencePreview =
    searchParams.get("preview") === EVIDENCE_COPILOT_PREVIEW ||
    browserPreviewParam === EVIDENCE_COPILOT_PREVIEW;
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
  } = useHistoryList(!isEvidencePreview);
  const { restore: restoreHistory, error: historyRestoreError } = useHistoryRestore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const hasConsumedFile = useRef(false);
  const [resolvedPromptText, setResolvedPromptText] = useState("");
  const [templateSaveContent, setTemplateSaveContent] = useState("");
  const [currentTemplateVariables, setCurrentTemplateVariables] = useState<TemplateVariable[]>([]);
  const [selectedFacetId, setSelectedFacetId] = useState<EvidenceFacetId | null>(null);
  const [referenceAspectRatio, setReferenceAspectRatio] = useState(4 / 5);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
  const [restoredSourceContext, setRestoredSourceContext] =
    useState<RestoredSourceContext | null>(null);
  // plan-02：生成参数升级为 Workspace v5 持久化状态——快速确认 UI、Render Dock
  // 与统一 submit 消费同一默认值（架构 §6.1 实现原则，禁止复制多套默认常量）。
  const generationParams = ws.generationParams;
  const handleGenerationParamsChange = useCallback(
    (params: { aspectRatio: AspectRatio; quality: Quality; model: string }) => {
      ws.setGenerationParams(
        params,
        params.aspectRatio !== generationParams.aspectRatio
          ? "user"
          : undefined,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [generationParams.aspectRatio],
  );
  // plan-02：上传时记录的参考图原始尺寸（reference_or_fallback 画幅解析输入）
  const referenceDimensionsRef = useRef<{ width: number; height: number } | null>(
    null,
  );
  // plan-02：快速自动提交的内存防重放锁——同一分析任务只允许一次自动 POST
  //（StrictMode/effect 重放/轮询重复 success 均由该锁与 consumed 持久化共同拦截）
  const quickSubmittedAnalysisTaskIdsRef = useRef<Set<string>>(new Set());

  // ─── plan-04（架构 §6.2）：Prompt 两轴控制/编辑方式/手动全文 dirty 页面状态 ────
  // 恢复快照优先（ws.promptControls 来自 v5 持久化/迁移）；新分析完成回默认
  // detail=standard（架构 §6.1.1）。editorMode 对旧任务无快照时降级 text（§3.2）。
  const [promptIntent, setPromptIntent] = useState<PromptIntent>(
    () => ws.promptControls.intent,
  );
  const [promptDetail, setPromptDetail] = useState<PromptDetailLevel>(
    () => ws.promptControls.detailLevel,
  );
  const [editorMode, setEditorMode] = useState<PromptEditorMode>(() => {
    if (ws.v2PromptState) {
      return ws.v2PromptState.outputMode === "custom" ? "text" : "variables";
    }
    // 旧编辑路径的自然默认：有可用分析模板进 variables，否则全文 text
    const hasTemplate =
      !!ws.analysisTemplateContent &&
      (ws.analysisTemplateStatus === "ready" ||
        ws.analysisTemplateStatus === "partial" ||
        ws.analysisTemplateStatus === null);
    return hasTemplate ? "variables" : "text";
  });
  // 持久化 outputMode=custom 意味着存在手动全文——恢复后仍受切换确认保护
  const [customPromptDirty, setCustomPromptDirty] = useState(
    () => ws.v2PromptState?.outputMode === "custom",
  );
  const [locatedInvariantId, setLocatedInvariantId] = useState<string | null>(
    null,
  );
  // ─── plan-05（架构 §6.4/§6.5）：方向结果/内联比较的页面状态 ─────────────────
  // 用户 invariant 调整（ADR-3）：独立于模型事实，只引用真实 invariantId；
  // 随当前草稿编译与「保留 / 改变」摘要派生，不写回 Recipe。
  const [adjustments, setAdjustments] = useState<InvariantAdjustment[]>([]);
  // 瞬时当前选择（selected）：新完成结果自动成为当前选择，绝不持久化；
  // 本次首选（preferred）走 ws.preferredIterationId，只由用户操作写入。
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(
    null,
  );
  const [comparisonIterationId, setComparisonIterationId] = useState<
    string | null
  >(null);
  const [keepChangeHighlightTargetId, setKeepChangeHighlightTargetId] =
    useState<string | null>(null);
  const [keepChangeAnnouncement, setKeepChangeAnnouncement] = useState<
    string | null
  >(null);
  // ─── plan-07（架构 §3.3 / §8.2 L1、L5）：工作区内联通知与降级状态 ────────────
  // 工作区级 polite 结果通知：生成完成/失败时更新，绝不移动正在编辑的焦点、
  // 不打开弹层（TC-7.4 契约；由方向 feed 的新终态驱动，覆盖轮询与刷新恢复）。
  const [workspaceAnnouncement, setWorkspaceAnnouncement] = useState<
    string | null
  >(null);
  // L5：POST /api/generation 提交失败（服务/DB 不可用）的内联错误——不声称
  // 任务已创建（无 active face），草稿与参数保留，重试创建新任务（TC-7.8）。
  const [generationSubmitError, setGenerationSubmitError] = useState<
    string | null
  >(null);
  // L1：自定义全文应用 disable 调整未命中 range 时的明确说明（不静默、不
  // 声称已删除；规则照常停用，全文逐字保留，TC-7.5 / 架构 §6.2 实现原则）。
  const [promptAdjustmentMiss, setPromptAdjustmentMiss] = useState<{
    invariantId: string;
    invariantValue: string;
  } | null>(null);
  // ─── plan-06（架构 §6.6 / §6.7）：preferred 验证、Memory 写点与新参考状态 ────
  // 无效首选清理提示（detail 验证发现结构性无效事实时写入；与窗口外提示互斥）
  const [preferredInvalidNotice, setPreferredInvalidNotice] =
    useState<PreferredInvalidNotice | null>(null);
  // 异步验证续体读取最新 preferred（避免闭包捕获旧会话偏好）
  const preferredIterationIdRef = useRef<string | null>(ws.preferredIterationId);
  preferredIterationIdRef.current = ws.preferredIterationId;
  // 窗口外 preferred 已经验证过的（analysisTaskId:iterationId）集合
  const externalPreferredVerifiedRef = useRef<Set<string>>(new Set());
  // 有来源 Memory 时：代表结果确认入口（复用 RepresentativeResultSelector）
  const [memorySelector, setMemorySelector] = useState<{
    preselectedIterationId: string | null;
  } | null>(null);
  // 无来源 Memory 时：保存向导来源（preferred/所选结果的 Iteration detail）
  const [saveMemorySource, setSaveMemorySource] = useState<{
    iterationId: string;
    detail: IterationDetail;
  } | null>(null);
  const [memoryEntryError, setMemoryEntryError] = useState<string | null>(null);
  // 写入成功但部分回读失败（「已保存，刷新失败」只重试读取，不重复 POST）
  const [memoryRefreshError, setMemoryRefreshError] = useState(false);
  const lastCommittedMemoryIdRef = useRef<string | null>(null);
  // 「作为新参考」方向切换守卫（复用 ReplaceConfirmDialog 骨架）
  const [newReferenceGuard, setNewReferenceGuard] = useState<{
    iterationId: string;
    resultAssetId: string;
    resultFileUrl: string;
    summary: string[];
  } | null>(null);
  const [newReferenceError, setNewReferenceError] = useState<string | null>(null);
  const knownDirectionCompletedIdsRef = useRef<Set<string> | null>(null);
  const lastAnalysisTaskIdRef = useRef<string | null>(ws.analysisTaskId);
  useEffect(() => {
    if (ws.analysisTaskId === lastAnalysisTaskIdRef.current) return;
    lastAnalysisTaskIdRef.current = ws.analysisTaskId;
    // 恢复态挂载/应用（enterHistoryRestored）带来的 analysisTaskId 不是新分析；
    // 清除恢复上下文（上传新参考图）后才按新方向回默认
    if (ws.currentIterationId) return;
    // 新分析 = 新方向：两轴控制回默认，不携带上一方向的草稿
    setPromptIntent("same_style");
    setPromptDetail("standard");
    setCustomPromptDirty(false);
    setLocatedInvariantId(null);
    // plan-05：新方向重置瞬时结果选择/比较面板与用户调整（preferred 持久化
    // 在 ws 快照中，由工作区 v5 语义管理，不在此清除）
    setSelectedIterationId(null);
    setComparisonIterationId(null);
    setAdjustments([]);
    setKeepChangeHighlightTargetId(null);
    setKeepChangeAnnouncement(null);
    setPromptAdjustmentMiss(null);
    knownDirectionCompletedIdsRef.current = null;
    // editorMode 在分析完成时按结果形态回默认（V2→variables；旧分析按
    // 是否有可用模板回 variables/text，与旧编辑器自然默认一致）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.analysisTaskId, ws.currentIterationId]);

  // Template UI state
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false);
  const setWorkspacePromptText = ws.setPromptText;

  const handleOpenTemplateSave = useCallback((content: string) => {
    setTemplateSaveContent(content);
    setShowTemplateSaveDialog(true);
  }, []);

  const handleResolvedPromptChange = useCallback(
    (value: string) => {
      setResolvedPromptText(value);
      setWorkspacePromptText(value);
    },
    [setWorkspacePromptText],
  );

  // plan-07：Memory 复用的生成上下文桥接（ADR-5 握手补齐 / ADR-7 门控输入）。
  // ?templateId= 加载 Memory 详情后，经既有 GET /api/generation/{iterationId}
  // （representativeResult.iterationId，回退 sourceGenerationTask.id）恢复来源
  // Iteration 的 analysisTaskId。该上下文只参与"是否存在生成上下文"的门控
  // （deriveRenderReadiness.generationContextReady），不注入轮询通道
  // useAnalysis——避免对陈旧任务 id 发起无意义轮询；POST /api/generation 时
  // 若无更优分析上下文则携带桥接值（真实端点校验其存在性）。
  const [recoveredGenerationContext, setRecoveredGenerationContext] = useState<{
    analysisTaskId: string;
  } | null>(null);
  const bridgedAttemptKeyRef = useRef<string | null>(null);

  // FEAT-04: templateId query 参数加载逻辑；plan-07 扩展为复用握手消费点
  useEffect(() => {
    const templateId = searchParams.get("templateId");
    if (!templateId) return;
    // 非空别名：跨闭包保留 string 收窄（loadTemplate 内多处使用）
    const memoryIdParam: string = templateId;

    let aborted = false;

    // plan-07：预检确认产生的会话快照已包含完整复用内容（提示/变量/
    // 来源参考图/身份/既有分析上下文）。识别到同 Memory 快照时不重复应用，
    // 防止把工作台提示回退为含 {{占位符}} 的模板原文。
    let snapshotAlreadyApplied = false;

    async function loadTemplate() {
      try {
        const res = await fetch(`/api/templates/${memoryIdParam}`);
        if (!res.ok) throw new Error("Template not found");
        const template = (await res.json()) as Partial<StyleMemoryDetail>;

        if (aborted) return;

        try {
          const raw = sessionStorage.getItem("style-gen-workspace-state");
          const persisted = raw
            ? (JSON.parse(raw) as { memoryIdentity?: { id?: string } | null })
            : null;
          snapshotAlreadyApplied =
            persisted?.memoryIdentity?.id === memoryIdParam &&
            typeof template.content === "string";
        } catch {
          // 忽略：快照损坏按未应用处理，走既有 fetch 应用路径（ADR-5 退化）
        }

        if (!snapshotAlreadyApplied) {
          // plan-07：直入路径写入模板载荷（不经 completeAnalysis 归一化）——
          // 变量定义保留 label 参与缺失门派生；状态 fallback 保持文本提示模式
          // 与既有 full-prompt 编辑器契约。提示在页面侧照常生效。
          const templateVariables = template.variables ?? [];
          setCurrentTemplateVariables(templateVariables);
          setResolvedPromptText(template.content ?? "");
          ws.setPromptText(template.content ?? "");
          ws.applyAnalysisTemplatePayload({
            analysisTemplateContent: template.content ?? null,
            analysisTemplateVariables: templateVariables,
            analysisTemplateStatus:
              templateVariables.length > 0 ? "fallback" : null,
            analysisTemplateReason: null,
          });
          // Memory 直入/切换时应用来源参考图并写入身份条数据源
          const memorySourceAssetId = template.sourceAssetId;
          const memorySourceImageUrl = template.sourceImageUrl;
          if (memorySourceAssetId && memorySourceImageUrl) {
            ws.setSourceReference(memorySourceAssetId, memorySourceImageUrl);
          }
          ws.setMemoryIdentity({
            id: memoryIdParam,
            name: template.name ?? memoryIdParam,
            verificationStatus:
              template.verificationStatus === "user_verified"
                ? "user_verified"
                : "pending_verification",
            retainedRuleCount: template.retainedRules?.length ?? 0,
          });
        }
        // plan-04（AC-02）：从 Style Memory 进入加载模板时记录 currentTemplateId，
        // 后续生成请求携带 sourceTemplateId（保障记录可按来源模板名搜索）
        ws.setRestoreContext({
          currentIterationId: null,
          currentTemplateId: memoryIdParam,
          previousResultUrl: null,
          restoredParams: null,
        });

        // plan-07：生成上下文桥接——仅当工作台没有可用的分析上下文时尝试恢复。
        // 每次挂载对同一 (templateId, iterationId) 只尝试一次；失败静默降级，
        // 身份条如实显示缺失、Generate 保持禁用（计划内决策）。
        const bridgeIterationId =
          template.representativeResult?.iterationId ??
          template.sourceGenerationTask?.id ??
          null;
        const attemptKey = `${memoryIdParam}:${bridgeIterationId ?? "none"}`;
        if (
          bridgeIterationId &&
          !ws.analysisTaskId &&
          bridgedAttemptKeyRef.current !== attemptKey
        ) {
          bridgedAttemptKeyRef.current = attemptKey;
          void (async () => {
            try {
              const detailRes = await fetch(`/api/generation/${bridgeIterationId}`);
              if (!detailRes.ok || aborted) return;
              const iterationDetail = (await detailRes.json()) as {
                analysisTaskId?: string | null;
              };
              if (iterationDetail.analysisTaskId) {
                setRecoveredGenerationContext({
                  analysisTaskId: iterationDetail.analysisTaskId,
                });
              }
            } catch {
              // 取不到来源分析上下文：门控保持关闭（可见退化而非报错）
            }
          })();
        }
      } catch (err) {
        // Template not found或加载失败，静默处理（不阻塞用户）
      } finally {
        if (!aborted) {
          // plan-07：预检确认的会话快照命中时延迟一拍再回落规范地址，
          // 保证 `/workspace?templateId=` 握手地址对用户/断言可观察
          // （ADR-5：URL 即一次性握手载体）；普通模板加载立即回落。
        if (snapshotAlreadyApplied) {
            window.setTimeout(() => {
              if (!aborted) {
                router.replace("/workspace");
              }
            }, REUSE_HANDSHAKE_URL_DWELL_MS);
          } else {
            router.replace("/workspace");
          }
        }
      }
    }

    void loadTemplate();

    return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("templateId")]);

  // Handle file from landing page (T06 global state)
  useEffect(() => {
    if (hasConsumedFile.current) return;
    const pendingFile = fileStore.consumeFile();
    if (pendingFile) {
      hasConsumedFile.current = true;
      void handleFileSelected(pendingFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // L1 degradation: analysis polling > 60s
  useQueueingDegradationTimer(
    ws.state,
    "analyzing",
    ws.degradation.analysisQueueing,
    ws.setAnalysisQueueing,
  );

  // L1 degradation: generation polling > 60s
  useQueueingDegradationTimer(
    ws.state,
    "generating",
    ws.degradation.generationQueueing,
    ws.setGenerationQueueing,
  );

  // Watch analysis polling results
  const lastCompletedAnalysisTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!analysisData) return;

    // Guard: ignore stale data from previous analysis task
    if (analysisData.id !== ws.analysisTaskId) return;

    if (analysisData.status === "completed") {
      const templateStatus = analysisData.analysisTemplateStatus ?? null;
      const analysisTemplateVariables = analysisData.analysisTemplateVariables ?? [];
      const hasAnalysisTemplate =
        (templateStatus === "ready" || templateStatus === "partial") &&
        !!analysisData.analysisTemplateContent &&
        analysisTemplateVariables.length > 0;
      // plan-04：新分析完成的编辑方式默认——V2 结构化进入 variables；
      // 旧分析按是否有可用模板回 variables/text（与旧编辑器自然默认一致）。
      // 已有该任务的持久化编辑（刷新后轮询重放 completed）时不重置用户视图。
      if (
        analysisData.id !== lastCompletedAnalysisTaskIdRef.current &&
        !ws.v2PromptState
      ) {
        lastCompletedAnalysisTaskIdRef.current = analysisData.id;
        setEditorMode(
          isVisualRecipeV2Success(analysisData.recipe) || hasAnalysisTemplate
            ? "variables"
            : "text",
        );
      }
      setCurrentTemplateVariables(
        hasAnalysisTemplate ? analysisTemplateVariables : [],
      );
      setRestoredSourceContext(null);
      const nextPromptText = analysisData.promptText ?? "";
      setResolvedPromptText(nextPromptText);
      ws.completeAnalysis(
        analysisData.recipe,
        nextPromptText,
        analysisData.negativePromptText ?? "",
        {
          analysisTemplateContent: analysisData.analysisTemplateContent,
          analysisTemplateVariables,
          analysisTemplateStatus: templateStatus,
          analysisTemplateReason: analysisData.analysisTemplateReason,
        },
      );
    } else if (analysisData.status === "failed") {
      ws.failAnalysis(
        analysisData.errorMessage ?? "Analysis Failed",
        analysisData.errorStage ?? undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisData?.status, analysisData?.id]);

  // plan-04（AC-03 / 架构 §6.3.4）：画幅选择与来源是用户持久决策——变化时绕过
  // 300ms 防抖同步落盘（ws.flush），保证快速 reload 后 user/restore 选择不丢。
  const lastFlushedRatioKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${ws.generationParams.aspectRatio}|${ws.aspectRatioSource}`;
    if (lastFlushedRatioKeyRef.current === key) return;
    const isFirstObservation = lastFlushedRatioKeyRef.current === null;
    lastFlushedRatioKeyRef.current = key;
    // 挂载首帧不落盘：避免抢先重写可能仍为旧版本的恢复快照
    if (isFirstObservation) return;
    // 空工作区无恢复/参考上下文时不落盘，避免写入无意义空快照
    if (!ws.assetId && !ws.referenceImageUrl && !ws.currentIterationId) return;
    ws.flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ws.generationParams.aspectRatio,
    ws.aspectRatioSource,
    ws.assetId,
    ws.referenceImageUrl,
    ws.currentIterationId,
  ]);

  // Watch generation polling results
  // plan-07（架构 §6.4 实现原则 / ADR-5）：终态只更新工作区状态与 rail，
  // 不再打开阻断式 GenerationDialog——进行中/成功/失败全部内联呈现。
  useEffect(() => {
    if (!generationData) return;
    // Guard: ignore stale data from previous generation task
    if (generationData.id !== ws.generationTaskId) return;

    if (generationData.status === "completed" && generationData.resultFileUrl) {
      ws.completeGeneration(generationData.resultFileUrl);
      // FEAT-02: Generation Complete后刷新历史列表
      queryClient.invalidateQueries({ queryKey: ["generation-history"] });
    } else if (generationData.status === "failed") {
      ws.failGeneration(generationData.errorMessage ?? "Generation Failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationData?.status, generationData?.id]);

  /** POST /api/analysis and enter the polling state; failures go through failAnalysis */
  const startAnalysisTask = useCallback(
    async (request: {
      assetId: string;
      fileUrl: string;
      width: number;
      height: number;
      mimeType: string;
    }) => {
      const analysisRes = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!analysisRes.ok) {
        const errData = await parseApiError(analysisRes);
        ws.failAnalysis(errData.error, undefined, errData.code, errData.retryable);
        return;
      }

      const analysisTask = (await analysisRes.json()) as { id: string };
      ws.startAnalysis(analysisTask.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      setRestoredSourceContext(null);
      ws.startUpload(file.type);
      try {
      const [{ assetId, fileUrl }, dimensions] = await Promise.all([
        upload(file),
        getImageDimensions(file),
      ]);
      // plan-02：记录参考图原始尺寸，供快速复刻画幅策略解析（架构 §6.3）
      referenceDimensionsRef.current = dimensions;
      // plan-04（架构 §6.3.3 / AC-03）：新方向按参考图写推荐画幅与 reference 来源
      //（user/restore 属于旧方向或恢复，不参与新方向初始化）
      const resolvedReferenceRatio = resolveAspectRatio({
        referenceWidth: dimensions.width,
        referenceHeight: dimensions.height,
      });
      ws.setGenerationParams(
        {
          ...ws.generationParams,
          aspectRatio: resolvedReferenceRatio.aspectRatio,
        },
        resolvedReferenceRatio.source,
      );
      ws.completeUpload(assetId, fileUrl);

        // Auto-trigger analysis
        await startAnalysisTask({
          assetId,
          fileUrl,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: file.type,
        });
      } catch (err) {
        ws.failAnalysis(
          err instanceof Error ? err.message : "Upload failed",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upload],
  );

  const handleAnalysisRetry = useCallback(async () => {
    if (!ws.assetId || !ws.referenceImageUrl) return;

    ws.clearError();
    ws.setAnalysisUnavailable(false);

    try {
      const dimensions = await getImageDimensions(ws.referenceImageUrl);
      // plan-04：重试沿用参考推荐画幅来源（user/restore 优先级不被覆盖）
      referenceDimensionsRef.current = dimensions;
      if (ws.aspectRatioSource !== "user" && ws.aspectRatioSource !== "restore") {
        const resolved = resolveAspectRatio({
          referenceWidth: dimensions.width,
          referenceHeight: dimensions.height,
        });
        ws.setGenerationParams(
          { ...ws.generationParams, aspectRatio: resolved.aspectRatio },
          resolved.source,
        );
      }
      await startAnalysisTask({
        assetId: ws.assetId,
        fileUrl: ws.referenceImageUrl,
        width: dimensions.width,
        height: dimensions.height,
        mimeType: ws.mimeType ?? "image/png",
      });
    } catch (err) {
      ws.failAnalysis(
        err instanceof Error ? err.message : "Analysis retry failed",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.assetId, ws.referenceImageUrl, ws.mimeType]);

  const handleReplace = useCallback(() => {
    setResolvedPromptText("");
    setCurrentTemplateVariables([]);
    setRestoredSourceContext(null);
    setReferenceAspectRatio(4 / 5);
    referenceDimensionsRef.current = null;
    ws.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Apply a restored snapshot's page-level state: prompt, variables, params, source context */
  const applyRestoredSnapshot = useCallback(
    (restored: {
      promptSnapshot: string;
      params: GenerationParams;
      analysisTaskId: string | null;
      sourceAssetId: string | null;
      sourceImageUrl: string | null;
      variables: TemplateVariable[];
    }) => {
      setResolvedPromptText(restored.promptSnapshot);
      setCurrentTemplateVariables(restored.variables);
      setRestoredSourceContext({
        sourceAnalysisTaskId: restored.analysisTaskId,
        sourceAssetId: restored.sourceAssetId,
        sourceImageUrl: restored.sourceImageUrl,
        variables: restored.variables,
      });
      // plan-04（架构 §3.2 旧任务行）：恢复无控制快照——两轴回默认、全文 text 模式
      setPromptIntent("same_style");
      setPromptDetail("standard");
      setEditorMode("text");
      setCustomPromptDirty(false);
      setLocatedInvariantId(null);
      // plan-05：恢复进入的是另一方向上下文，调整与瞬时比较态不跨方向携带
      setAdjustments([]);
      setComparisonIterationId(null);
      setKeepChangeHighlightTargetId(null);
      setKeepChangeAnnouncement(null);
      setPromptAdjustmentMiss(null);
      // plan-02（AC-03）+ plan-04（§6.3 / 用例 TC-4.11）：Iteration 恢复的画幅走
      // 来源优先级解析——合法值写 restore；未知值清洗回 1:1 且来源 fallback，
      // 不冒充恢复选择或参考推荐。
      const resolvedRestoredRatio = resolveAspectRatio({
        restoreValue: restored.params.aspectRatio,
      });
      ws.setGenerationParams(
        {
          aspectRatio: resolvedRestoredRatio.aspectRatio,
          quality: restored.params.quality as Quality,
          // 存量迭代无 model（或 id 已下线）；未知值回退配置默认模型
          model:
            restored.params.model && isKnownImageGenModel(restored.params.model)
              ? restored.params.model
              : DEFAULT_IMAGE_GEN_MODEL_ID,
        },
        resolvedRestoredRatio.source,
      );
    },
    [],
  );

  const applyHistoryRestore = useCallback(
    (restoredData: RestoredData | HistoryDetail) => {
      const sourceAssetId = restoredData.sourceAssetId ?? ws.assetId;
      const sourceImageUrl = restoredData.sourceImageUrl ?? ws.referenceImageUrl;
      applyRestoredSnapshot({
        promptSnapshot: restoredData.promptSnapshot,
        params: restoredData.params,
        analysisTaskId: restoredData.analysisTaskId,
        sourceAssetId,
        sourceImageUrl,
        variables: restoredData.variables ?? [],
      });
      ws.enterHistoryRestored(
        restoredData.resultFileUrl,
        restoredData.recipe,
        restoredData.promptSnapshot,
        restoredData.negativePromptSnapshot,
        restoredData.analysisTaskId,
        {
          sourceAssetId,
          sourceImageUrl,
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.assetId, ws.referenceImageUrl],
  );

  // plan-04: 消费 Iteration Memory 恢复载荷（模式与既有 useHistoryRestore 一致）。
  // ws 初始状态已按恢复快照以 history_restored 挂载（提示/排除项/配方/来源/
  // currentIterationId / currentTemplateId / 上一轮结果），这里应用页面级状态：
  // 输出参数、变量与来源上下文。恢复动作本身不触发任何生成请求（ADR-4）。
  // 最小 seed（仅 pendingIterationRestore 通道）下挂载 ctx 可能缺顶层字段，
  // 因此消费时用载荷补全 ws（enterHistoryRestored + restore context），
  // 并由下方 flush 固化——payload 通道清空后仍可完整恢复。
  const didConsumeIterationRestoreRef = useRef(false);
  const iterationRestoreAppliedRef = useRef(false);
  useEffect(() => {
    if (didConsumeIterationRestoreRef.current) return;
    didConsumeIterationRestoreRef.current = true;

    const payload = consumePendingIterationRestore();
    if (!payload) return;
    iterationRestoreAppliedRef.current = true;

    applyRestoredSnapshot(payload);
    ws.setRestoreContext({
      currentIterationId: payload.iterationId,
      currentTemplateId: payload.sourceTemplateId,
      previousResultUrl: payload.resultFileUrl,
      restoredParams: payload.params,
    });
    ws.enterHistoryRestored(
      payload.resultFileUrl ?? "",
      payload.recipe,
      payload.promptSnapshot,
      payload.negativePromptSnapshot,
      payload.analysisTaskId,
      {
        sourceAssetId: payload.sourceAssetId,
        sourceImageUrl: payload.sourceImageUrl,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // plan-04（架构 §6.3）: 恢复载荷应用后同步 flush——固化应用后的快照，
  // 确保通道中不再残留待应用标记（防重复应用）。
  const didFlushIterationRestoreRef = useRef(false);
  useEffect(() => {
    if (!iterationRestoreAppliedRef.current) return;
    if (ws.currentIterationId === null) return;
    if (didFlushIterationRestoreRef.current) return;
    didFlushIterationRestoreRef.current = true;
    ws.flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.currentIterationId]);

  const openHistoryDetail = useCallback((detail: HistoryDetail) => {
    setHistoryDetail(detail);
    setHistoryDetailOpen(true);
  }, []);

  const handleHistorySelect = useCallback(
    async (id: string) => {
      try {
        const restoredData = await restoreHistory(id);
        openHistoryDetail({ id, ...restoredData });
      } catch (err) {
        console.error("Failed to load history detail:", err instanceof Error ? err.message : err);
      }
    },
    [restoreHistory, openHistoryDetail],
  );

  const handleHistoryRestore = useCallback(
    (id: string) => {
      if (historyDetail?.id === id) {
        applyHistoryRestore(historyDetail);
        setHistoryDetailOpen(false);
        return;
      }

      void restoreHistory(id)
        .then((restoredData) => {
          applyHistoryRestore(restoredData);
          setHistoryDetailOpen(false);
        })
        .catch((err) => {
          console.error("Failed to restore history:", err instanceof Error ? err.message : err);
        });
    },
    [applyHistoryRestore, historyDetail, restoreHistory],
  );

  const handlePreviewHistorySelect = useCallback(
    (id: string) => {
      openHistoryDetail({
        id,
        resultFileUrl: previewReferenceImageUrl,
        recipe: previewRecipe,
        promptSnapshot: previewPrompt,
        negativePromptSnapshot: previewNegativePrompt,
        params: generationParams,
        analysisTaskId: EVIDENCE_COPILOT_PREVIEW,
        sourceAssetId: "preview-reference-asset",
        sourceImageUrl: previewReferenceImageUrl,
        variables: previewTemplateVariables,
      });
    },
    [generationParams, openHistoryDetail],
  );

  // Effective (preview-or-live) values: Evidence Copilot preview substitutes
  // static fixtures; live mode derives everything from workspace state.
  const effectiveState = isEvidencePreview ? ("analysis_ready" as const) : ws.state;
  const effectiveReferenceImageUrl = isEvidencePreview
    ? previewReferenceImageUrl
    : ws.referenceImageUrl;
  const effectiveDegradation = isEvidencePreview
    ? previewDegradation
    : ws.degradation;

  // Recipe + evidence
  const effectiveRecipe = isEvidencePreview ? previewRecipe : ws.recipe;
  const effectiveLegacyRecipe = toLegacyVisualRecipe(effectiveRecipe);
  const hasStructuredRecipe = isVisualRecipeV2Success(effectiveRecipe);

  // ─── plan-04（架构 §6.2）：controls → compiled prompt → 最终 Prompt 单一派生 ────
  // 纯函数编译（≤50ms、无 AI 请求）；未手动改写时 intent/detail/变量变化即时重编译。
  const liveV2Recipe: VisualRecipeV2Success | null =
    !isEvidencePreview && isVisualRecipeV2Success(ws.recipe) ? ws.recipe : null;
  const liveV2State = !isEvidencePreview ? ws.v2PromptState : null;
  const promptControlSnapshot = useMemo<PromptControlSnapshot | null>(() => {
    if (!liveV2Recipe || !liveV2State) return null;
    return {
      schemaVersion: 1,
      trigger: "manual",
      intent: promptIntent,
      detailLevel: promptDetail,
      editorMode,
      customPromptDirty,
      enabledInvariantIds: liveV2State.enabledInvariantIds,
      variableValues: liveV2State.variableValues,
      enabledModifierNames: liveV2State.enabledModifierNames,
      modifierValues: Object.fromEntries(
        Object.entries(liveV2State.modifierValues).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      // plan-05（AC-05）：用户对真实规则的调整进入编译与提交快照（ADR-3）
      adjustments,
      customTemplate: liveV2State.customTemplate,
    };
  }, [liveV2Recipe, liveV2State, promptIntent, promptDetail, editorMode, customPromptDirty, adjustments]);

  const compiledPromptDocument = useMemo(() => {
    if (!liveV2Recipe || !promptControlSnapshot) return null;
    return composePromptDocument(liveV2Recipe, promptControlSnapshot);
  }, [liveV2Recipe, promptControlSnapshot]);

  /**
   * 最终 Prompt（resolved）：手动改写时取 customPrompt；否则编译文档（或用户
   * 改写过的变量模板）按当前变量值解析。旧任务/降级路径返回 null，回落既有
   * resolvedPromptText 通道（promptSnapshot 全文，架构 §3.2 旧任务行）。
   */
  const finalPromptText = useMemo<string | null>(() => {
    if (!liveV2Recipe || !liveV2State) return null;
    // 手动全文（dirty 标记或持久化 outputMode=custom）优先于编译结果
    if (customPromptDirty || liveV2State.outputMode === "custom") {
      return liveV2State.customPrompt;
    }
    const base = liveV2State.customTemplate ?? compiledPromptDocument?.text;
    if (base === null || base === undefined) return null;
    return renderPromptTemplate(base, liveV2Recipe, {
      ...liveV2State.variableValues,
      ...liveV2State.modifierValues,
    });
  }, [
    liveV2Recipe,
    liveV2State,
    customPromptDirty,
    compiledPromptDocument,
  ]);

  // plan-04（架构 §6.2.5 / AC-05）：摘要只从真实规则与变量派生，不伪造来源
  // plan-05：摘要消费用户调整（disable 的规则不再计入保留项）
  const keepChangeState = useMemo(() => {
    if (!liveV2Recipe || !liveV2State) return null;
    const summary = deriveKeepChangeSummary(liveV2Recipe, {
      enabledInvariantIds: liveV2State.enabledInvariantIds,
      variableValues: liveV2State.variableValues,
      adjustments,
    });
    const keepItems = summary.keptInvariantIds.flatMap((invariantId) => {
      const invariant = liveV2Recipe.styleInvariants.find(
        (item) => item.id === invariantId,
      );
      return invariant
        ? [{ invariantId, value: invariant.value, dimension: invariant.dimension }]
        : [];
    });
    const changeItems = summary.changedVariableNames.flatMap((name) => {
      const variable = liveV2Recipe.contentVariables.find(
        (item) => item.name === name,
      );
      if (!variable) return [];
      return [
        {
          variableName: name,
          label: variable.label || variable.name,
          value: liveV2State.variableValues[name] ?? "",
          defaultValue: variable.defaultValue,
        },
      ];
    });
    return { keepItems, changeItems };
  }, [liveV2Recipe, liveV2State, adjustments]);

  // Prompt text (a resolved edit wins over the mode's fallback)
  const effectivePromptText = isEvidencePreview ? previewPrompt : ws.promptText;
  const effectiveNegativePromptText = isEvidencePreview
    ? previewNegativePrompt
    : ws.negativePromptText;
  const activePromptText = (
    // plan-04：V2 流程的最终 Prompt 以页面编译结果为准（单一来源）；
    // 旧任务/降级路径回落编辑器回写的 resolvedPromptText。
    !isEvidencePreview && finalPromptText !== null
      ? finalPromptText
      : resolvedPromptText || (isEvidencePreview ? previewPrompt : ws.promptText)
  ).trim();

  // Analysis template
  const effectiveTemplateContent = isEvidencePreview
    ? previewTemplateContent
    : ws.analysisTemplateContent;
  const effectiveTemplateVariables = isEvidencePreview
    ? previewTemplateVariables
    : restoredSourceContext?.variables.length
      ? restoredSourceContext.variables
      : ws.analysisTemplateVariables;
  const effectiveTemplateStatus = isEvidencePreview
    ? ("ready" as const)
    : ws.analysisTemplateStatus;
  const effectiveTemplateReason = isEvidencePreview
    ? null
    : ws.analysisTemplateReason;
  const effectiveTemplateKey = isEvidencePreview
    ? EVIDENCE_COPILOT_PREVIEW
    : ws.analysisTaskId;
  const activePromptHasUnresolvedVariables = hasUnresolvedVariables(activePromptText);
  // plan-07（ADR-7）：Memory 复用上下文的缺失必填清单单一派生点——
  // 必填定义 = trim(defaultValue)===''，展示名 label 优先回退 name。
  // 定义集合优先取持久化的分析模板变量（带 label 的 SSOT；页面局部
  // currentTemplateVariables 会被编辑器回写去 label 并混入负向提示辅助位），
  // 并显式排除辅助变量，避免把"Negative constraints"算进必填门。
  const memoryGateVariables =
    ws.analysisTemplateVariables.length > 0
      ? ws.analysisTemplateVariables
      : currentTemplateVariables.length > 0
        ? currentTemplateVariables
        : effectiveTemplateVariables;
  const memoryMissingVariableNames = useMemo(
    () =>
      memoryGateVariables
        .filter((variable) => variable.name !== "negative_prompt")
        .filter((variable) => !String(variable.defaultValue ?? "").trim())
        .map((variable) => variable.label || variable.name),
    [memoryGateVariables],
  );
  const memoryReadinessContext = ws.memoryIdentity
    ? {
        id: ws.memoryIdentity.id,
        retainedRuleCount: ws.memoryIdentity.retainedRuleCount,
        missingVariableNames: memoryMissingVariableNames,
      }
    : null;
  const evidenceFacets = useMemo(
    () => deriveEvidenceFacets(effectiveRecipe),
    [effectiveRecipe],
  );
  const promptProvenanceSpans = useMemo(
    () => derivePromptProvenanceSpans(activePromptText || effectivePromptText, evidenceFacets),
    [activePromptText, effectivePromptText, evidenceFacets],
  );
  const renderReadiness = useMemo(
    () =>
      deriveRenderReadiness({
        promptText: activePromptText,
        variables:
          currentTemplateVariables.length > 0
            ? currentTemplateVariables
            : effectiveTemplateVariables,
        hasUnresolvedVariables: activePromptHasUnresolvedVariables,
        facets: evidenceFacets,
        workspaceState: effectiveState,
        degradation: effectiveDegradation,
        error: isEvidencePreview ? null : ws.error,
        analysisTaskId: isEvidencePreview ? EVIDENCE_COPILOT_PREVIEW : ws.analysisTaskId,
        // plan-07：Memory 复用上下文与桥接生成上下文（唯一派生调用点，ADR-7）
        memory: isEvidencePreview ? null : memoryReadinessContext,
        generationContextReady: Boolean(recoveredGenerationContext?.analysisTaskId),
      }),
    [
      activePromptHasUnresolvedVariables,
      activePromptText,
      currentTemplateVariables,
      effectiveDegradation,
      effectiveState,
      effectiveTemplateVariables,
      evidenceFacets,
      isEvidencePreview,
      memoryReadinessContext,
      recoveredGenerationContext,
      ws.analysisTaskId,
      ws.error,
    ],
  );
  const canGenerate = renderReadiness.canGenerate;
  const generateDisabledReason = renderReadiness.disabledReason;

  // plan-04：两轴控制/摘要/最终 Prompt/来源徽标依赖 sessionStorage 派生状态——
  // 首帧与 SSR 输出保持一致（不渲染），挂载后再显示，避免 hydration 不匹配
  // 触发整树重建打断既有恢复/复用握手链路。
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // ─── plan-05（ADR-5 / 架构 §6.4）：方向结果 feed 与本次结果区状态 ────────────
  // 方向 key = analysisTaskId（ADR-1）；hook 内部按 key 隔离缓存、active 存在时
  // 定时刷新、错误保留 previous data。当前主动任务仍由 useGeneration 详情轮询。
  const directionAnalysisTaskId =
    !isEvidencePreview && hasMounted ? ws.analysisTaskId : null;
  const directionFeed = useDirectionIterations(directionAnalysisTaskId);
  const comparisonDetail = useIterationDetail(comparisonIterationId);

  // plan-06（架构 §6.7.2 / AC-06）：来源 Memory 验证状态位数据源——服务端详情
  // 派生（pending_verification / user_verified + 代表结果），禁止客户端乐观
  // 伪造；与详情页共用 `style-memory-detail/{id}` key，统一刷新协调器失效并
  // 回读同一 owner（写成功回读完成后状态位无需整页刷新即更新）。
  const sourceMemoryId =
    !isEvidencePreview && hasMounted ? ws.currentTemplateId : null;
  const sourceMemoryDetailQuery = useQuery({
    queryKey: ["style-memory-detail", sourceMemoryId],
    queryFn: ({ signal }) => fetchStyleMemoryDetail(sourceMemoryId!, signal),
    enabled: !!sourceMemoryId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const sourceMemoryDetail = sourceMemoryDetailQuery.data ?? null;
  const memoryStatus: DirectionMemoryStatus | null =
    sourceMemoryId && sourceMemoryDetail
      ? {
          memoryName: sourceMemoryDetail.name ?? null,
          verificationStatus:
            sourceMemoryDetail.verificationStatus === "user_verified"
              ? "user_verified"
              : "pending_verification",
          representativeIterationId:
            sourceMemoryDetail.representativeResult?.iterationId ?? null,
        }
      : null;

  // 新完成结果自动成为瞬时 selected；绝不自动写 preferred（§6.4.7，
  // preferred 只由用户操作写入 ws.preferredIterationId）。
  // plan-07（架构 §3.3）：同一 effect 驱动工作区级 polite 通知——由方向
  // feed 的新终态（而非仅详情轮询回调）触发，页面刷新后按数据库事实恢复
  // 终态时不重复播报（known 初始化帧不播报）。
  const lastAnnouncedFailureIdRef = useRef<string | null>(null);
  useEffect(() => {
    const feed = directionFeed.feed;
    const completed = feed?.completed ?? [];
    if (completed.length === 0 && !feed?.latestFailure) return;
    const ids = new Set(completed.map((item) => item.id));
    const known = knownDirectionCompletedIdsRef.current;
    knownDirectionCompletedIdsRef.current = ids;
    if (known === null) {
      if (completed.length > 0) {
        setSelectedIterationId((current) => current ?? completed[0]!.id);
      }
      lastAnnouncedFailureIdRef.current = feed?.latestFailure?.id ?? null;
      return;
    }
    // completed 可能为空（feed 只有 active/latestFailure 的中间帧）：
    // 新成功播报只在确有 completed 时进行，避免 completed[0] 越界。
    if (completed.length > 0) {
      const latest = completed[0]!;
      if (!known.has(latest.id)) {
        setSelectedIterationId(latest.id);
        // polite 结果通知：成功内联进入本次结果区，不夺正在编辑的焦点
        setWorkspaceAnnouncement(
          "生成完成：新结果已加入本次结果区，可直接比较或继续编辑。",
        );
      }
    }
    const failureId = feed?.latestFailure?.id ?? null;
    if (failureId && failureId !== lastAnnouncedFailureIdRef.current) {
      setWorkspaceAnnouncement(
        "最近一次生成失败：原因与重试入口在本次结果区，参考与草稿保持不变。",
      );
    }
    lastAnnouncedFailureIdRef.current = failureId;
  }, [directionFeed.feed]);

  const handleDirectionSelect = useCallback((iterationId: string) => {
    // selected 瞬时切换：只影响本次结果区视图，不持久化、不动 preferred
    setSelectedIterationId(iterationId);
  }, []);

  /**
   * plan-06（架构 §6.7.1 / AC-06）：preferred 写入总是经 Iteration detail 验证。
   * preferredIterationId 只表示会话偏好（护栏 4）——点击即时写入会话，随后异步
   * GET detail 校验归属/方向/completed/资产：结构性无效才清除并说明原因；
   * 详情暂时不可读（网络/5xx）保留会话偏好（不据此清除）。再次点击同项取消。
   */
  const handleDirectionSetPreferred = useCallback(
    (iterationId: string) => {
      if (ws.preferredIterationId === iterationId) {
        ws.setPreferredIterationId(null);
        setPreferredInvalidNotice(null);
        return;
      }
      ws.setPreferredIterationId(iterationId);
      setPreferredInvalidNotice(null);
      const analysisTaskId = ws.analysisTaskId;
      void (async () => {
        let validation: PreferredValidation;
        try {
          const detail = await fetchIterationDetailFor(iterationId);
          validation = validatePreferredDetail(detail, analysisTaskId ?? "");
        } catch {
          // 详情暂不可读：保留会话偏好（清除只针对明确的结构性无效事实）
          return;
        }
        if (
          validation.outcome === "invalid" &&
          preferredIterationIdRef.current === iterationId
        ) {
          ws.setPreferredIterationId(null);
          setPreferredInvalidNotice({ iterationId, reason: validation.reason });
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.preferredIterationId, ws.analysisTaskId],
  );

  // plan-06（§3.2 首选滚出五条窗口）：滚出窗口的 preferred 经 detail 复验——
  // 有效则保留（窗口外提示），无效才清除并说明原因。窗口内的条目由点击时验证
  // 覆盖，不重复请求；每个（方向, iterationId）只复验一次。
  useEffect(() => {
    const preferredId = ws.preferredIterationId;
    const analysisTaskId = ws.analysisTaskId;
    if (!preferredId || !analysisTaskId) return;
    const completed = directionFeed.feed?.completed ?? [];
    if (completed.some((item) => item.id === preferredId)) return;
    const verifiedKey = `${analysisTaskId}:${preferredId}`;
    if (externalPreferredVerifiedRef.current.has(verifiedKey)) return;
    externalPreferredVerifiedRef.current.add(verifiedKey);
    void (async () => {
      let validation: PreferredValidation;
      try {
        const detail = await fetchIterationDetailFor(preferredId);
        validation = validatePreferredDetail(detail, analysisTaskId);
      } catch {
        return;
      }
      if (
        validation.outcome === "invalid" &&
        preferredIterationIdRef.current === preferredId
      ) {
        ws.setPreferredIterationId(null);
        setPreferredInvalidNotice({ iterationId: preferredId, reason: validation.reason });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.preferredIterationId, ws.analysisTaskId, directionFeed.feed]);

  const handleDirectionCompare = useCallback((iterationId: string) => {
    setComparisonIterationId(iterationId);
  }, []);

  /** 取消/关闭比较：零写入，焦点回该结果的比较触发器（ADR-7） */
  const handleComparisonCancel = useCallback(() => {
    const iterationId = comparisonIterationId;
    setComparisonIterationId(null);
    if (iterationId) {
      focusBySelector(
        `[data-testid="direction-completed-item"][data-iteration-id="${iterationId}"] [data-testid="direction-item-compare"]`,
      );
    }
  }, [comparisonIterationId]);

  /** 应用调整：按 invariantId 覆盖当前草稿 adjustment，重编译但不 submit（§6.5.5） */
  const handleComparisonApplyAdjustment = useCallback(
    (adjustment: InvariantAdjustment) => {
      if (!liveV2Recipe) return;
      let next: InvariantAdjustment[];
      try {
        next = applyInvariantAdjustment(liveV2Recipe, adjustments, adjustment);
      } catch {
        // 未知 invariantId：不写草稿（面板只提供真实规则；防御兜底）
        return;
      }
      setAdjustments(next);
      setComparisonIterationId(null);
      setKeepChangeHighlightTargetId(adjustment.invariantId);

      // plan-07（架构 §6.2 实现原则 / §8.2 L1）：自定义全文是当前最终 Prompt 时，
      // 调整按 range 回退算法落到全文——在全文中定位该规则表达（命中 range）
      // 后交由 plan-01 纯函数局部替换/删除或追加 Adjustments 段；disable 未
      // 命中时只停用规则并明确说明「未找到可删除表达」，不静默、不声称已
      // 删除，全文逐字保留。
      const invariant = liveV2Recipe.styleInvariants.find(
        (item) => item.id === adjustment.invariantId,
      );
      const customState = liveV2State;
      const customTextActive =
        !!customState && (customPromptDirty || customState.outputMode === "custom");
      if (invariant && customTextActive && customState) {
        const customText = customState.customPrompt;
        const hitIndex = customText.indexOf(invariant.value);
        const segments: CompiledPromptSegment[] =
          hitIndex >= 0
            ? [
                {
                  sourceKind: "invariant",
                  sourceId: invariant.id,
                  dimension: invariant.dimension,
                  startIndex: hitIndex,
                  endIndex: hitIndex + invariant.value.length,
                },
              ]
            : [];
        const outcome = applyAdjustmentToCustomText(
          customText,
          segments,
          adjustment,
        );
        if (outcome.status === "not_found") {
          setPromptAdjustmentMiss({
            invariantId: invariant.id,
            invariantValue: invariant.value,
          });
        } else {
          setPromptAdjustmentMiss(null);
          if (outcome.text !== customText) {
            setCustomPromptDirty(true);
            ws.setV2PromptState((current) => ({
              ...current,
              outputMode: "custom",
              customPrompt: outcome.text,
            }));
          }
        }
      } else {
        setPromptAdjustmentMiss(null);
      }

      setKeepChangeAnnouncement("已按所选规则更新当前草稿的调整。");
      focusBySelector(
        `[data-testid="keep-change-item"][data-target-id="${adjustment.invariantId}"]`,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveV2Recipe, adjustments, liveV2State, customPromptDirty],
  );

  /** 「其他」维度：切换全文编辑并聚焦（不创建 adjustment，§6.5.2） */
  const handleComparisonOtherDimension = useCallback(() => {
    setEditorMode("text");
    focusBySelector('[data-testid="fulltext-prompt-editor"]');
  }, []);

  /** 完整历史由 Iteration Memory 管理（更旧结果滚出五条窗口后仍可达） */
  const navigateToIterationMemory = useCallback(() => {
    router.push("/workspace/iterations?status=all");
  }, [router]);

  const handleDirectionOpenIteration = useCallback(() => {
    navigateToIterationMemory();
  }, [navigateToIterationMemory]);

  // ─── plan-06（实现规格 §2/§4）：Memory 写成功后的统一刷新协调器 ────────────────
  // 四类回读走各自唯一 owner key：templates 列表前缀（fetchQuery 回源读取）、
  // `style-memory-detail/{memoryId}`、该 Memory 的 representative candidates、
  // `direction-iterations/{analysisTaskId}`。任一回读失败 → 「已保存，刷新失败」，
  // 只重试读取：不重复 POST、不回滚服务端事实、不乐观伪造验证状态。
  const runMemoryRefreshReadBacks = useCallback(
    async (memoryId: string) => {
      const analysisTaskId = ws.analysisTaskId;
      // 先统一失效（含列表前缀），再逐一回读
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({
        queryKey: ["style-memory-detail", memoryId],
      });
      await queryClient.invalidateQueries({
        queryKey: representativeCandidatesQueryKey(memoryId),
      });
      if (analysisTaskId) {
        await queryClient.invalidateQueries({
          queryKey: directionIterationsQueryKey(analysisTaskId),
        });
      }
      const readBacks: Promise<unknown>[] = [
        queryClient.fetchQuery({
          queryKey: ["templates", { search: "", status: "all" }],
          queryFn: ({ signal }) => fetchStyleMemoryListPage(signal),
        }),
        // throwOnError：refetchQueries 默认吞掉查询错误；回读结果必须显式
        // 拒绝，协调器才能据实呈现「已保存，刷新失败」（写入事实不受影响）
        queryClient.refetchQueries(
          { queryKey: ["style-memory-detail", memoryId], type: "all" },
          { throwOnError: true },
        ),
        queryClient.refetchQueries(
          { queryKey: representativeCandidatesQueryKey(memoryId), type: "all" },
          { throwOnError: true },
        ),
      ];
      if (analysisTaskId) {
        readBacks.push(
          queryClient.refetchQueries(
            { queryKey: directionIterationsQueryKey(analysisTaskId), type: "all" },
            { throwOnError: true },
          ),
        );
      }
      const settled = await Promise.allSettled(readBacks);
      return settled.every((result) => result.status === "fulfilled");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, ws.analysisTaskId],
  );

  const refreshCommittedMemoryWrite = useCallback(
    async (memoryId: string) => {
      lastCommittedMemoryIdRef.current = memoryId;
      const ok = await runMemoryRefreshReadBacks(memoryId);
      setMemoryRefreshError(!ok);
      return ok;
    },
    [runMemoryRefreshReadBacks],
  );

  /** 「已保存，刷新失败」重试：只重试读取，绝不重复写请求（AC-06） */
  const handleMemoryRefreshRetry = useCallback(() => {
    const memoryId = lastCommittedMemoryIdRef.current ?? ws.currentTemplateId;
    if (!memoryId) {
      setMemoryRefreshError(false);
      return;
    }
    void (async () => {
      const ok = await runMemoryRefreshReadBacks(memoryId);
      setMemoryRefreshError(!ok);
    })();
  }, [runMemoryRefreshReadBacks, ws.currentTemplateId]);

  /**
   * plan-06（实现规格 §2）：rail Memory 动作——无 currentTemplateId 时从结果
   * detail 打开既有 SaveStyleMemoryDialog（预选该完成结果为代表结果）；有
   * currentTemplateId 时打开既有代表结果确认（RepresentativeResultSelector，
   * 预选 preferred 结果）。验证状态只由服务端派生，客户端不写 templates。
   */
  const handleDirectionOpenMemory = useCallback(
    (iterationId: string) => {
      setMemoryEntryError(null);
      const item = (directionFeed.feed?.completed ?? []).find(
        (candidate) => candidate.id === iterationId,
      );
      if (!item?.resultAssetId || !item.resultFileUrl) return;
      if (ws.currentTemplateId) {
        setMemorySelector({
          preselectedIterationId: ws.preferredIterationId ?? iterationId,
        });
        return;
      }
      void (async () => {
        try {
          const detail = await fetchIterationDetailFor(iterationId);
          setSaveMemorySource({ iterationId, detail });
        } catch {
          setMemoryEntryError(
            "读取该结果详情失败，暂时无法打开保存向导；请稍后重试。",
          );
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [directionFeed.feed, ws.currentTemplateId, ws.preferredIterationId],
  );

  /**
   * plan-06（架构 §6.6 / ADR-6 / AC-07）：结果作为新参考——方向切换守卫比较
   * Prompt、negative constraints、生成参数与当前来源（对照所选结果快照）；
   * 取消零写入并还原焦点；确认后仅提交 {sourceAssetId} 复用既有 Asset
   * （不下载/重传/复制），清当前方向瞬时 selected/preferred、节奏回
   * analyze_edit，以结果图为参考进入新分析；旧方向任务保持不变可回溯。
   */
  const newReferenceSubmittingRef = useRef(false);
  const handleDirectionUseAsNewReference = useCallback(
    (iterationId: string) => {
      const item = (directionFeed.feed?.completed ?? []).find(
        (candidate) => candidate.id === iterationId,
      );
      if (!item?.resultAssetId || !item.resultFileUrl) return;
      const resultAssetId = item.resultAssetId;
      const resultFileUrl = item.resultFileUrl;
      setNewReferenceError(null);
      void (async () => {
        let detail: IterationDetail | null = null;
        try {
          detail = await fetchIterationDetailFor(iterationId);
        } catch {
          // 快照不可读时守卫摘要降级为来源切换说明（方向切换仍可确认）
        }
        setNewReferenceGuard({
          iterationId,
          resultAssetId,
          resultFileUrl,
          summary: buildNewReferenceUnfinishedSummary({
            currentPromptText: activePromptText,
            currentNegativePromptText: ws.negativePromptText,
            currentParams: generationParams,
            targetDetail: detail,
          }),
        });
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      directionFeed.feed,
      activePromptText,
      ws.negativePromptText,
      generationParams,
    ],
  );

  /** 取消守卫：零写入并还原焦点到触发器（§6.6.3） */
  const handleNewReferenceCancel = useCallback(() => {
    const iterationId = newReferenceGuard?.iterationId ?? null;
    setNewReferenceGuard(null);
    setNewReferenceError(null);
    if (iterationId) {
      focusBySelector(
        `[data-testid="direction-completed-item"][data-iteration-id="${iterationId}"] [data-testid="direction-item-new-reference"]`,
      );
    }
  }, [newReferenceGuard]);

  /** 确认守卫：POST /api/analysis 仅携带 sourceAssetId；失败保留原方向（L5） */
  const handleNewReferenceConfirm = useCallback(async () => {
    const guard = newReferenceGuard;
    if (!guard || newReferenceSubmittingRef.current) return;
    newReferenceSubmittingRef.current = true;
    setNewReferenceError(null);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAssetId: guard.resultAssetId }),
      });
      if (!res.ok) {
        const errData = await parseApiError(res);
        setNewReferenceError(
          errData.error ?? "无法使用该结果作为新参考，请稍后重试。",
        );
        return;
      }
      const analysisTask = (await res.json()) as { id: string };
      // 确认切换：清当前方向瞬时选择与 preferred，节奏回 analyze_edit
      setNewReferenceGuard(null);
      setNewReferenceError(null);
      setPreferredInvalidNotice(null);
      setSelectedIterationId(null);
      setComparisonIterationId(null);
      ws.setPreferredIterationId(null);
      ws.setCreationPace("analyze_edit");
      // 以结果图为参考进入新方向分析（复用同一 Asset，不重传）；旧方向任务不变
      ws.completeUpload(guard.resultAssetId, guard.resultFileUrl);
      ws.startAnalysis(analysisTask.id);
    } catch {
      setNewReferenceError("网络错误——暂时无法使用该结果作为新参考，请重试。");
    } finally {
      newReferenceSubmittingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newReferenceGuard]);

  // ─── plan-04：两轴控制区状态与动作（挂载于 PromptCard 顶层） ──────────────────
  const promptControlsState: PromptCardControlsState | null =
    !isEvidencePreview &&
    hasMounted &&
    (effectiveState === "analyzing" || activePromptText || effectiveRecipe)
      ? {
          intent: promptIntent,
          detailLevel: promptDetail,
          editorMode,
          customPromptDirty,
          disabled: effectiveState === "analyzing",
          locked: ws.quickAuthorization === "armed",
          structuredAvailable: liveV2Recipe !== null,
        }
      : null;

  /** 确认替换手动全文（架构 §3.2）：dirty 清除，V2 全文回到新编译结果 */
  const clearCustomPromptAfterSwitch = useCallback(() => {
    setCustomPromptDirty(false);
    ws.setV2PromptState((current) => ({
      ...current,
      outputMode: "standard",
      customPrompt: "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIntentChange = useCallback(
    (intent: PromptIntent) => {
      setPromptIntent(intent);
      if (customPromptDirty) clearCustomPromptAfterSwitch();
    },
    [clearCustomPromptAfterSwitch, customPromptDirty],
  );

  const handleDetailChange = useCallback(
    (detail: PromptDetailLevel) => {
      setPromptDetail(detail);
      if (customPromptDirty) clearCustomPromptAfterSwitch();
    },
    [clearCustomPromptAfterSwitch, customPromptDirty],
  );

  const handleEditorModeChange = useCallback((mode: PromptEditorMode) => {
    setEditorMode(mode);
  }, []);

  /** 手动改写全文（V2 受控 text 视图）：写 customPrompt 并标记 dirty */
  const handleCustomPromptChange = useCallback((value: string) => {
    setCustomPromptDirty(true);
    ws.setV2PromptState((current) => ({
      ...current,
      outputMode: "custom",
      customPrompt: value,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 旧全文路径（unified editor）手动改写：仅标记 dirty，文本由编辑器持有 */
  const handleManualTextChange = useCallback(() => {
    setCustomPromptDirty(true);
  }, []);

  /**
   * plan-04（AC-05）：摘要定位——保留项定位 Recipe 真实规则（展开 + data-located），
   * 改变项切回 variables 视图并聚焦对应变量输入；polite 通知不夺正在编辑的焦点。
   */
  const handleKeepChangeLocate = useCallback(
    (target: KeepChangeLocateTarget) => {
      if (target.kind === "keep") {
        setLocatedInvariantId(target.invariantId);
        return;
      }
      setEditorMode("variables");
      const variable = liveV2Recipe?.contentVariables.find(
        (item) => item.name === target.variableName,
      );
      const label = variable?.label || variable?.name || target.variableName;
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLInputElement>(
            `input[aria-label="${CSS.escape(label)}"]`,
          )
          ?.focus();
      });
    },
    [liveV2Recipe],
  );
  // Template Save Dialog: custom V2 output mode starts from an empty variable set
  const isCustomV2OutputMode =
    hasStructuredRecipe && ws.v2PromptState?.outputMode === "custom";
  const templateSaveInitialVariables =
    currentTemplateVariables.length > 0
      ? currentTemplateVariables
      : effectiveTemplateVariables;

  /**
   * plan-02（架构 §6.1.7）：统一 submit——手动生成与快速自动提交共用同一
   * POST /api/generation 通道；快速路径额外固化 promptControlSnapshot，
   * 使保存的任务可回证确认披露值。
   *
   * plan-07（架构 §2.1.6 / §8.2 L5）：提交不再打开阻断式 GenerationDialog。
   * POST 失败（服务/DB 不可用）以内联 `generation-submit-error` 呈现：不写
   * ws 任务态（不声称任务已创建、无 active face）、草稿与参数保留，用户经
   * `generation-submit-retry` 主动重试（创建新任务）。
   */
  const submitGeneration = useCallback(
    async (payload: {
      analysisTaskId: string;
      promptText: string;
      negativePromptText: string;
      params: { aspectRatio: string; quality: string; model?: string };
      promptControlSnapshot?: PromptControlSnapshot;
      sourceTemplateId?: string | null;
    }) => {
      setGenerationSubmitError(null);
      try {
        const res = await fetch("/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisTaskId: payload.analysisTaskId,
            promptText: payload.promptText,
            negativePromptText: payload.negativePromptText,
            params: {
              aspectRatio: payload.params.aspectRatio,
              quality: payload.params.quality,
              model: payload.params.model ?? DEFAULT_IMAGE_GEN_MODEL_ID,
            },
            ...(payload.promptControlSnapshot
              ? { promptControlSnapshot: payload.promptControlSnapshot }
              : {}),
            // plan-04（AC-02 / PRD 业务规则 4）：从 Style Memory 进入（?templateId=）
            // 或恢复携带来源模板的迭代时，记录本次生成的来源模板，
            // 保障记录可按来源 Style Memory 名称搜索
            ...(payload.sourceTemplateId
              ? { sourceTemplateId: payload.sourceTemplateId }
              : {}),
          }),
        });

        if (!res.ok) {
          const errData = await parseApiError(res);
          setGenerationSubmitError(errData.error);
          return;
        }

        const task = (await res.json()) as { id: string; status: string };
        ws.startGeneration(task.id);
        // plan-05（架构 §6.4.5）：POST 成功后立即刷新方向 feed，
        // 让 active face 尽快进入本次结果区（active 存在时转入定时刷新）
        void queryClient.invalidateQueries({
          queryKey: directionIterationsQueryKey(),
        });
      } catch (err) {
        setGenerationSubmitError(
          err instanceof Error ? err.message : "Generation request failed",
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleGenerate = useCallback(
    async (params: {
      aspectRatio: string;
      quality: string;
      model?: string;
    }) => {
      // plan-07：生成上下文 = 既有分析轮询 id，或 Memory 桥接恢复的来源分析 id
      const generationAnalysisTaskId =
        ws.analysisTaskId ?? recoveredGenerationContext?.analysisTaskId ?? null;
      if (!renderReadiness.canGenerate || !generationAnalysisTaskId) return;

      await submitGeneration({
        analysisTaskId: generationAnalysisTaskId,
        promptText: activePromptText,
        negativePromptText: ws.negativePromptText,
        params,
        sourceTemplateId: ws.currentTemplateId,
        // plan-04（ADR-4）：手动生成同样固化 Prompt 控制快照，结果可回证当前控制
        ...(promptControlSnapshot ? { promptControlSnapshot } : {}),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activePromptText,
      renderReadiness.canGenerate,
      recoveredGenerationContext,
      submitGeneration,
      ws.analysisTaskId,
      ws.negativePromptText,
      ws.currentTemplateId,
    ],
  );

  /**
   * plan-05（架构 §6.4 / §7.4）：失败主动重试与「沿用当前草稿再次生成」。
   * 两者都创建新的 GenerationTask（不复活原任务），且只读取当前草稿；
   * 统一 submit 内部负责刷新方向 feed 展示新 active。
   */
  const submitGenerationFromCurrentDraft = useCallback(() => {
    if (!renderReadiness.canGenerate) return;
    void handleGenerate(generationParams);
  }, [renderReadiness.canGenerate, handleGenerate, generationParams]);

  /**
   * plan-02（ADR-2 / 架构 §6.1.6-7）：快速复刻自动提交编排。
   * 仅在分析 V2 success 且 quickAuthorization=armed 时触发：
   * - readiness 校验快照/Recipe/Prompt/服务可用/参数一致性，失败原子复位
   *   none + 清快照 + 同步 flush 并展示同一阻止原因；
   * - 通过后先持久化 consumed（同步 flush）再 POST；内存任务锁 +
   *   consumed 闩锁保证 effect 重放、页面重载、轮询重复 success 均不重放；
   * - 自动请求不读取 live 草稿——Prompt/负向提示由确认快照 + Recipe 默认值
   *   确定性编译；失败保持 consumed，用户仅可主动重试（不复活 armed）。
   */
  useEffect(() => {
    if (isEvidencePreview) return;
    if (ws.state !== "analysis_ready") return;
    if (ws.quickAuthorization !== "armed") return;

    const authorization = ws.quickGenerationAuthorizationSnapshot;
    const analysisTaskId = ws.analysisTaskId;

    if (!analysisTaskId) {
      ws.clearQuickAuthorization(
        "Quick recreate is waiting for an analysis context. Generate manually or confirm the quick path again.",
      );
      return;
    }
    // 防重放：该分析任务已自动提交过（effect 重放/重复 success）
    if (quickSubmittedAnalysisTaskIdsRef.current.has(analysisTaskId)) return;

    if (!authorization || !isVisualRecipeV2Success(ws.recipe)) {
      ws.clearQuickAuthorization(
        "Quick recreate needs a complete style analysis. Your reference and edits are preserved; generate manually or confirm the quick path again.",
      );
      return;
    }

    const derivation = deriveQuickRecreateSubmission({
      recipe: ws.recipe,
      authorization,
    });
    const serviceBlocked =
      ws.degradation.generationUnavailable ||
      ws.error?.code === "SERVICE_UNAVAILABLE";
    if (
      serviceBlocked ||
      !derivation.promptText.trim() ||
      !authorization.generationSettings.quality ||
      !authorization.generationSettings.model
    ) {
      ws.clearQuickAuthorization(
        serviceBlocked
          ? "Generation service is temporarily unavailable, so quick recreate was cleared. Retry when the service recovers."
          : "Quick recreate could not compile a prompt from the confirmed settings. Edit the prompt manually or confirm the quick path again.",
      );
      return;
    }

    // 防重放锁先于 consumed 写入（StrictMode 下 effect 重放时 state 尚未提交）
    quickSubmittedAnalysisTaskIdsRef.current.add(analysisTaskId);
    // 先持久化 consumed（同步 flush），再发起请求（ADR-2）
    ws.consumeQuickAuthorization();

    void (async () => {
      // 画幅按 reference_or_fallback 解析：优先上传时记录的参考尺寸，
      // 恢复/缺失场景从参考图现读；均不可读才回退 1:1（架构 §6.3）。
      let referenceSize = referenceDimensionsRef.current;
      if (!referenceSize && ws.referenceImageUrl) {
        try {
          referenceSize = await getImageDimensions(ws.referenceImageUrl);
          referenceDimensionsRef.current = referenceSize;
        } catch {
          referenceSize = null;
        }
      }
      const resolved = resolveAspectRatio(
        referenceSize
          ? {
              referenceWidth: referenceSize.width,
              referenceHeight: referenceSize.height,
            }
          : {},
      );

      await submitGeneration({
        analysisTaskId,
        promptText: derivation.promptText,
        negativePromptText: derivation.negativePromptText,
        params: {
          aspectRatio: resolved.aspectRatio,
          quality: authorization.generationSettings.quality,
          model: authorization.generationSettings.model,
        },
        promptControlSnapshot: derivation.promptControlSnapshot,
        sourceTemplateId: ws.currentTemplateId,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEvidencePreview,
    ws.state,
    ws.quickAuthorization,
    ws.quickGenerationAuthorizationSnapshot,
    ws.analysisTaskId,
    ws.recipe,
    ws.degradation.generationUnavailable,
    ws.error?.code,
  ]);

  useEffect(() => {
    if (
      selectedFacetId &&
      !evidenceFacets.some((facet) => facet.id === selectedFacetId)
    ) {
      setSelectedFacetId(null);
    }
  }, [evidenceFacets, selectedFacetId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isTypingTarget =
        tagName === "textarea" ||
        tagName === "input" ||
        tagName === "select" ||
        target?.isContentEditable;
      // plan-07（Task 5 / red 证据 TC-7.4 决策项）：聚焦在原生控件
      // （button / a / [role="button"]）上时，Enter 属于控件自身的标准激活
      // 键——快捷键不得 preventDefault 劫持激活并误触发生成。
      const isControlTarget =
        tagName === "button" ||
        tagName === "a" ||
        !!target?.closest('button, a, [role="button"]');

      if (isTypingTarget || isControlTarget || !canGenerate || isEvidencePreview) {
        return;
      }

      event.preventDefault();
      void handleGenerate(generationParams);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGenerate, generationParams, handleGenerate, isEvidencePreview]);

  const historyItems = (historyData ?? []).slice(0, 20).map((item) => ({
    id: item.id,
    resultFileUrl: item.resultFileUrl,
    createdAt: item.createdAt,
  }));
  const effectiveHistoryItems = isEvidencePreview
    ? previewHistoryItems
    : historyItems;
  const historyErrorStatus =
    historyError && "status" in historyError
      ? (historyError as { status?: number }).status
      : undefined;
  const historyStripStatus = deriveHistoryStripStatus({
    isPreview: isEvidencePreview,
    isError: isHistoryError,
    isLoading: isHistoryLoading,
  });
  const workspaceTitle = isEvidencePreview ? "Editorial Soft Light" : "Workspace";

  // plan-07：移除身份条——清 currentTemplateId 与 Memory 身份，工作区内容保留
  // （PRD 规则 21：身份条持续可见直至移除/替换来源）；随自动持久化落盘
  const handleRemoveMemoryIdentity = useCallback(() => {
    ws.setRestoreContext({ currentTemplateId: null });
    ws.setMemoryIdentity(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHistoryContinueEditing = useCallback(
    (detail: HistoryDetail) => {
      applyHistoryRestore(detail);
      setHistoryDetailOpen(false);
    },
    [applyHistoryRestore],
  );

  return (
    <div className="h-full overflow-hidden">
      {/* 中央Workspace */}
      <div className="flex h-full min-w-0 flex-col overflow-hidden">
        <WorkspaceTopBar title={workspaceTitle} subtitle="Reference to render workbench" />

        <AiCopilotRibbon
          state={effectiveState}
          recipe={effectiveLegacyRecipe}
          hasReference={!!effectiveReferenceImageUrl}
          hasPrompt={!!activePromptText}
          canGenerate={canGenerate}
          disabledReason={generateDisabledReason}
          degradation={effectiveDegradation}
        />

        {/* plan-07（PRD 规则 21 / AC-08）：复用身份条——顶栏下方条状区，确认导航后首屏焦点落点；缺失清单消费同一就绪结论对象 */}
        {ws.memoryIdentity && (
          <MemoryIdentityBar
            identity={ws.memoryIdentity}
            missingVariableNames={
              isEvidencePreview ? [] : renderReadiness.missingVariableNames
            }
            onRemove={handleRemoveMemoryIdentity}
          />
        )}

        {/* plan-02（架构 §3.1 / ADR-2）：创作节奏双入口与快速复刻确认区——
            确认披露、armed 状态与退出入口常驻三栏上方，不遮挡参考/证据/编辑 */}
        {!isEvidencePreview && (
          <CreationPaceSelector
            creationPace={ws.creationPace}
            quickAuthorization={ws.quickAuthorization}
            generationSettings={{
              quality: generationParams.quality,
              model: generationParams.model,
            }}
            clearedReason={ws.quickAuthorizationClearedReason}
            onConfirmQuickRecreate={ws.confirmQuickRecreate}
            onExitQuickRecreate={ws.exitQuickRecreate}
            onSelectAnalyzeEdit={() => ws.setCreationPace("analyze_edit")}
          />
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceThreeColumnLayout
            referenceAspectRatio={referenceAspectRatio}
            reference={
              <ReferenceCard
                state={effectiveState}
                referenceImageUrl={effectiveReferenceImageUrl}
                isUploading={
                  isEvidencePreview ? false : isUploading || ws.state === "uploading"
                }
                uploadProgress={isEvidencePreview ? 0 : progress}
                error={ws.error}
                onFileSelected={handleFileSelected}
                onReplace={handleReplace}
                onRetry={handleAnalysisRetry}
                onAspectRatioChange={setReferenceAspectRatio}
              />
            }
            recipe={
              <RecipeCard
                state={effectiveState}
                recipe={effectiveRecipe}
                facets={evidenceFacets}
                provenanceSpans={promptProvenanceSpans}
                selectedFacetId={selectedFacetId}
                onFacetSelect={setSelectedFacetId}
                enabledInvariantIds={ws.v2PromptState?.enabledInvariantIds}
                locatedInvariantId={hasMounted ? locatedInvariantId : null}
                onInvariantToggle={(invariantId) => {
                  ws.setV2PromptState((current) => ({
                    ...current,
                    enabledInvariantIds: current.enabledInvariantIds.includes(invariantId)
                      ? current.enabledInvariantIds.filter((id) => id !== invariantId)
                      : [...current.enabledInvariantIds, invariantId],
                  }));
                }}
              />
            }
            prompt={
              <PromptCard
                state={effectiveState}
                promptText={effectivePromptText}
                negativePromptText={effectiveNegativePromptText}
                error={ws.error}
                templateContent={effectiveTemplateContent}
                templateVariables={effectiveTemplateVariables}
                templateStatus={effectiveTemplateStatus}
                templateReason={effectiveTemplateReason}
                templateKey={effectiveTemplateKey}
                recipe={effectiveRecipe}
                v2PromptState={ws.v2PromptState}
                provenanceSpans={promptProvenanceSpans}
                selectedFacetId={selectedFacetId}
                onV2PromptStateChange={ws.setV2PromptState}
                onResolvedPromptChange={handleResolvedPromptChange}
                onTemplateVariablesChange={setCurrentTemplateVariables}
                onNegativePromptChange={ws.setNegativePromptText}
                onSaveTemplate={handleOpenTemplateSave}
                promptControlsState={promptControlsState}
                onIntentChange={handleIntentChange}
                onDetailChange={handleDetailChange}
                onEditorModeChange={handleEditorModeChange}
                compiledPromptText={
                  hasMounted && finalPromptText !== null
                    ? finalPromptText
                    : promptControlsState
                      ? activePromptText
                      : null
                }
                compiledTemplate={compiledPromptDocument?.text ?? null}
                keepChange={
                  hasMounted && keepChangeState && promptControlsState
                    ? {
                        ...keepChangeState,
                        highlightedTargetId: keepChangeHighlightTargetId,
                        announcement: keepChangeAnnouncement,
                      }
                    : null
                }
                onKeepChangeLocate={handleKeepChangeLocate}
                adjustmentMissNote={
                  hasMounted ? promptAdjustmentMiss : null
                }
                onCustomPromptChange={handleCustomPromptChange}
                onManualTextChange={handleManualTextChange}
                renderDock={
                  <OutputCard
                    state={effectiveState}
                    params={generationParams}
                    readiness={renderReadiness}
                    onParamsChange={handleGenerationParamsChange}
                    settingsLocked={!isEvidencePreview && ws.quickAuthorization === "armed"}
                    aspectRatioSource={
                      !isEvidencePreview && hasMounted
                        ? ws.aspectRatioSource
                        : undefined
                    }
                    generationQueueing={
                      !isEvidencePreview && ws.degradation.generationQueueing
                    }
                    onGenerate={(params) => {
                      if (isEvidencePreview) return;
                      void handleGenerate(params);
                    }}
                  />
                }
              />
            }
          />
        </div>

        {/* plan-05（ADR-5 / ADR-7）：本次结果区——五成功缩略图 + active/failure
            独立呈现，紧凑 rail 不遮挡三栏；更旧结果仍在 Iteration Memory */}
        {!isEvidencePreview && hasMounted && ws.analysisTaskId && (
          <DirectionResultRail
            feed={directionFeed.feed}
            isLoading={directionFeed.isLoading}
            isError={directionFeed.isError}
            errorMessage={directionFeed.error?.message ?? null}
            selectedIterationId={selectedIterationId}
            preferredIterationId={ws.preferredIterationId}
            preferredInvalidNotice={preferredInvalidNotice}
            memoryStatus={memoryStatus}
            onSelect={handleDirectionSelect}
            onSetPreferred={handleDirectionSetPreferred}
            onCompare={handleDirectionCompare}
            onRegenerate={submitGenerationFromCurrentDraft}
            onUseAsNewReference={handleDirectionUseAsNewReference}
            onOpenMemoryAction={handleDirectionOpenMemory}
            onOpenIteration={handleDirectionOpenIteration}
            onOpenPreferredDetail={navigateToIterationMemory}
            onRetryFailure={submitGenerationFromCurrentDraft}
            onRetryFeed={directionFeed.refetch}
          />
        )}

        {/* plan-07（架构 §3.3）：工作区级结果通知——生成完成/失败时以 polite
            live region 播报，不移动正在编辑的焦点、不打开弹层（TC-7.4 契约） */}
        <p
          data-testid="workspace-live-region"
          role="status"
          aria-live="polite"
          className="sr-only"
        >
          {workspaceAnnouncement ?? ""}
        </p>

        {/* plan-07（架构 §8.2 L5）：生成提交失败内联位——不声称任务已创建、
            草稿与参数保留；重试创建新任务（与 rail/Render Dock 同上下文） */}
        {!isEvidencePreview && hasMounted && generationSubmitError && (
          <div
            data-testid="generation-submit-error"
            role="alert"
            className="mx-4 mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-bright)]/72 px-3 py-2 ring-1 ring-[var(--color-error-soft,var(--border-interactive))] sm:mx-6 lg:mx-8"
          >
            <p className="min-w-0 text-xs leading-5 text-[var(--color-error)]">
              生成提交失败：{generationSubmitError}。任务未创建，当前参考、
              Prompt 草稿与生成参数保持不变，可稍后重试创建新任务。
            </p>
            <button
              type="button"
              data-testid="generation-submit-retry"
              onClick={submitGenerationFromCurrentDraft}
              className="btn-secondary h-7 shrink-0 rounded-lg px-2.5 text-xs font-medium"
            >
              重试提交
            </button>
          </div>
        )}

        {/* plan-06（实现规格 §2 / AC-06）：Memory 写入已成功但部分回读失败——
            保留服务端成功事实，明确「已保存，刷新失败」，只提供读取重试 */}
        {!isEvidencePreview && hasMounted && memoryRefreshError && (
          <div
            data-testid="memory-refresh-partial-error"
            aria-live="polite"
            className="mx-4 mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-bright)]/72 px-3 py-2 ring-1 ring-[var(--border-interactive)] sm:mx-6 lg:mx-8"
          >
            <p className="min-w-0 text-xs leading-5 text-[var(--text-secondary)]">
              已保存，刷新失败。Style Memory 写入已在服务端完成，读取最新验证
              状态暂时失败；重试只刷新读取，不会重复提交。
            </p>
            <button
              type="button"
              data-testid="memory-refresh-retry"
              onClick={handleMemoryRefreshRetry}
              className="btn-secondary h-7 shrink-0 rounded-lg px-2.5 text-xs font-medium"
            >
              重试读取
            </button>
          </div>
        )}

        {memoryEntryError && (
          <p
            role="alert"
            className="mx-4 mb-2 shrink-0 text-xs leading-5 text-[var(--color-error)] sm:mx-6 lg:mx-8"
          >
            {memoryEntryError}
          </p>
        )}

        {/* plan-05（ADR-7）：内联比较区——focus-managed region（非模态），
            打开聚焦标题、取消回触发器、应用聚焦更新的摘要项 */}
        {!isEvidencePreview && hasMounted && comparisonIterationId && (
          <ResultComparisonPanel
            iterationId={comparisonIterationId}
            detail={comparisonDetail.detail}
            detailStatus={comparisonDetail.status}
            detailErrorMessage={comparisonDetail.error?.message ?? null}
            recipe={liveV2Recipe}
            compiledPrompt={compiledPromptDocument}
            onRetryDetail={comparisonDetail.retry}
            onOpenIteration={handleDirectionOpenIteration}
            onApplyAdjustment={handleComparisonApplyAdjustment}
            onCancel={handleComparisonCancel}
            onSelectOtherDimension={handleComparisonOtherDimension}
          />
        )}

        {/* plan-04: 上一轮结果展示位——恢复携带 resultFileUrl 的迭代时保留可见 */}
        {ws.previousResultUrl && (
          <div
            data-testid="previous-result-preview"
            className="mx-4 mb-2 flex shrink-0 items-center gap-3 rounded-lg bg-[var(--surface-low)]/72 p-2 ring-1 ring-[var(--border-static)] sm:mx-6 lg:mx-8"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ws.previousResultUrl}
              alt="Previous iteration result"
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Previous result
              </p>
              <p className="truncate text-[0.6875rem] leading-5 text-[var(--text-secondary)]">
                Kept from the restored iteration for reference. Your next render
                creates a new iteration.
              </p>
            </div>
          </div>
        )}

        <WorkspaceBottomBar
          history={
            <HistoryStrip
              historyItems={effectiveHistoryItems}
              status={historyStripStatus}
              errorMessage={historyError?.message}
              errorStatus={historyErrorStatus}
              onSelect={
                isEvidencePreview ? handlePreviewHistorySelect : handleHistorySelect
              }
              onViewAll={() => router.push("/workspace/iterations?status=all")}
            />
          }
        />

        {/* plan-07（架构 §2.1.6 / §6.4 实现原则）：成功/进行中/失败不再经由
            阻断式 GenerationDialog 呈现——终态内联进入方向 rail，工作区级
            通知走 polite live region，提交失败走内联 generation-submit-error。
            GenerationDialog 组件保留兼容（存量引用与组件契约见其单测），
            Workspace 主流程不再打开它。 */}

        <HistoryDetailDialog
          open={historyDetailOpen}
          detail={historyDetail}
          onRestore={handleHistoryRestore}
          onContinueEditing={handleHistoryContinueEditing}
          onClose={() => setHistoryDetailOpen(false)}
          restoreError={historyRestoreError?.message}
        />

        {/* plan-06 流程 B: 工作区草稿保存向导（无代表结果，保存为 pending verification） */}
        <TemplateSaveDialog
          open={showTemplateSaveDialog}
          initialContent={templateSaveContent || effectivePromptText}
          initialVariables={
            isCustomV2OutputMode ? [] : templateSaveInitialVariables
          }
          recipe={effectiveRecipe}
          negativePromptText={effectiveNegativePromptText}
          sourceAnalysisTaskId={
            restoredSourceContext?.sourceAnalysisTaskId ?? ws.analysisTaskId ?? undefined
          }
          sourceAssetId={restoredSourceContext?.sourceAssetId ?? ws.assetId}
          sourceImageUrl={
            restoredSourceContext?.sourceImageUrl ?? effectiveReferenceImageUrl
          }
          onSave={() => {
            setShowTemplateSaveDialog(false);
          }}
          onClose={() => setShowTemplateSaveDialog(false)}
        />

        {/* plan-06（实现规格 §2）：无来源 Memory——从 preferred/所选结果 detail 打开
            既有保存向导（第 14 期语义不变，仅预选代表结果）；create 成功回调同一
            刷新协调器（向导自身负责进入新 Memory 详情） */}
        {saveMemorySource && (
          <SaveStyleMemoryDialog
            open
            promptSnapshot={saveMemorySource.detail.promptSnapshot}
            variables={saveMemorySource.detail.variables}
            negativePromptSnapshot={saveMemorySource.detail.negativePromptSnapshot}
            recipe={saveMemorySource.detail.recipe}
            recipeSource={saveMemorySource.detail.recipeSource}
            sourceImageUrl={saveMemorySource.detail.sourceImageUrl}
            resultFileUrl={saveMemorySource.detail.resultFileUrl}
            sourceAssetId={saveMemorySource.detail.sourceAssetId}
            sourceGenerationTaskId={saveMemorySource.iterationId}
            defaultRepresentative
            onSaved={(template) => {
              void refreshCommittedMemoryWrite(template.id);
            }}
            onClose={() => setSaveMemorySource(null)}
          />
        )}

        {/* plan-06（实现规格 §2/§4）：有来源 Memory——打开既有代表结果确认
            （preferred 结果预选）；确认成功回调统一刷新协调器 */}
        {memorySelector && ws.currentTemplateId && (
          <RepresentativeResultSelector
            memoryId={ws.currentTemplateId}
            memoryName={sourceMemoryDetail?.name ?? ws.currentTemplateId}
            open
            preselectedIterationId={memorySelector.preselectedIterationId}
            onClose={() => setMemorySelector(null)}
            onConfirmed={async () => {
              await refreshCommittedMemoryWrite(
                ws.currentTemplateId ?? lastCommittedMemoryIdRef.current ?? "",
              ).catch(() => undefined);
            }}
          />
        )}

        {/* plan-06（架构 §6.6）：作为新参考的方向切换守卫（复用 ReplaceConfirmDialog
            骨架，不新增第二套弹层）——取消零写入；确认仅提交 sourceAssetId */}
        <ReplaceConfirmDialog
          variant="new-reference"
          open={newReferenceGuard !== null}
          currentPrompt=""
          targetPrompt=""
          unfinishedSummary={newReferenceGuard?.summary ?? []}
          errorText={newReferenceError}
          onCancel={handleNewReferenceCancel}
          onConfirm={() => void handleNewReferenceConfirm()}
        />
      </div>
    </div>
  );
}

/** Suspense boundary for useSearchParams() (Next.js 15 requirement) */
export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">Loading...</div>}>
      <WorkspacePageInner />
    </Suspense>
  );
}
