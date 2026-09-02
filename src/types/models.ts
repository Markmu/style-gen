/** 资产类型 */
export type AssetType = "reference" | "generated";

/** 资产记录 */
export interface Asset {
  id: string;
  type: AssetType;
  fileUrl: string;
  thumbnailUrl: string | null;
  width: number;
  height: number;
  mimeType: string;
  userId: string | null;
  createdAt: Date;
}

/** 用户记录 */
export interface User {
  id: string;
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** V1 Visual Recipe — 仅用于读取旧记录和兼容 UI。 */
export interface VisualRecipe {
  imageSummary: string;
  subject: string;
  scene: string;
  composition: string;
  cameraLanguage: string;
  lighting: string;
  color: string;
  texture: string;
  styleTags: string[];
  mood: string;
  visualKeywords: string[];
  mustKeep: string[];
  replaceable: string[];
}

export type LegacyVisualRecipe = VisualRecipe;

export type ExtractionStatus = "ready" | "partial" | "fallback";

export const STYLE_DIMENSIONS = [
  "visualMedium",
  "composition",
  "camera",
  "color",
  "lighting",
  "formLanguage",
  "materialTexture",
  "atmosphere",
  "rendering",
] as const;

export type StyleDimension = (typeof STYLE_DIMENSIONS)[number];

export interface StyleObservation {
  id: string;
  value: string;
  evidence: string[];
  confidence: number;
}

export interface ContentDescription {
  summary: string;
  subject?: string;
  subjectAttributes: string[];
  actionOrState?: string;
  environment?: string;
  supportingElements: string[];
  timeOrWeather?: string;
}

export interface StyleInvariant extends StyleObservation {
  kind: "hard" | "soft";
  dimension: StyleDimension;
  sourceObservationIds: string[];
}

export type ContentVariableSourceField =
  | "subject"
  | "subject_attributes"
  | "action"
  | "environment"
  | "supporting_elements"
  | "time_weather";

export interface ContentVariable {
  name: string;
  label: string;
  defaultValue: string;
  sourceField: ContentVariableSourceField;
}

export interface OptionalModifier {
  name: "mood" | "primary_color";
  label: string;
  defaultValue: string;
  dimension: "atmosphere" | "color";
  enabledByDefault: false;
}

export const STYLE_FINGERPRINT_SCORE_KEYS = [
  "realism",
  "abstraction",
  "contrast",
  "saturation",
  "softness",
  "detailDensity",
  "symmetry",
  "depth",
  "atmosphericIntensity",
] as const;

export type StyleFingerprintScoreKey =
  (typeof STYLE_FINGERPRINT_SCORE_KEYS)[number];

export interface StyleFingerprint {
  tokens: string[];
  scores: Record<StyleFingerprintScoreKey, number | null>;
}

export interface PromptOutputs {
  reconstructionPrompt: string;
  conciseTemplate: string;
  standardTemplate: string;
  professionalTemplate: string;
}

export interface VisualRecipeV2Success {
  schemaVersion: 2;
  extractionStatus: "ready" | "partial";
  extractionReasons: string[];
  contentDescription: ContentDescription;
  styleProfile: Record<StyleDimension, StyleObservation[]>;
  styleInvariants: StyleInvariant[];
  contentVariables: ContentVariable[];
  optionalModifiers: OptionalModifier[];
  negativeConstraints: string[];
  styleFingerprint: StyleFingerprint;
  promptOutputs: PromptOutputs;
}

export interface VisualRecipeV2Fallback {
  schemaVersion: 2;
  extractionStatus: "fallback";
  extractionReasons: string[];
  promptOutputs: null;
}

export type VisualRecipeV2 = VisualRecipeV2Success | VisualRecipeV2Fallback;

/** JSONB persisted recipe. V1 stays readable; all new successful analyses write V2. */
export type StoredVisualRecipe = VisualRecipe | VisualRecipeV2;

export type PromptOutputMode =
  | "reconstruction"
  | "concise"
  | "standard"
  | "professional"
  | "structured"
  | "custom";

export interface V2PromptWorkspaceState {
  outputMode: PromptOutputMode;
  enabledInvariantIds: string[];
  variableValues: Record<string, string>;
  enabledModifierNames: OptionalModifier["name"][];
  modifierValues: Partial<Record<OptionalModifier["name"], string>>;
  customTemplate?: string;
  customPrompt: string;
}

// ─── 第 15 期 plan-01（Workspace 证据引导生成闭环，架构 §7.2） ────────────────

/** 创作节奏（架构 §7.2；UI「分析后编辑 / 快速复刻」） */
export type CreationPace = "analyze_edit" | "quick_recreate";

/** 快速复刻一次性授权闩锁状态；armed 必须伴随合法 QuickGenerationAuthorizationSnapshot */
export type QuickAuthorization = "none" | "armed" | "consumed";

/** Prompt 创作意图（UI「贴近复刻 / 同风格创作」） */
export type PromptIntent = "reconstruction" | "same_style";

/** Prompt 表达程度（UI「快速 / 平衡 / 详细」） */
export type PromptDetailLevel = "concise" | "standard" | "professional";

/** Prompt 编辑方式 */
export type PromptEditorMode = "variables" | "text" | "structured";

/** 面向真实 invariant 的四类用户调整（UI「加强保留 / 放宽 / 替换 / 不再保留」） */
export type AdjustmentAction = "strengthen" | "relax" | "replace" | "disable";

/** 用户对单条风格规则的调整；只引用 Recipe 中真实 invariantId，不写回模型事实（ADR-3） */
export interface InvariantAdjustment {
  invariantId: string;
  action: AdjustmentAction;
  replacementValue?: string;
}

/** Prompt 控制快照：当前草稿（sessionStorage v5）与提交任务共用同一契约（ADR-4） */
export interface PromptControlSnapshot {
  schemaVersion: 1;
  trigger: "manual" | "quick_recreate";
  intent: PromptIntent;
  detailLevel: PromptDetailLevel;
  editorMode: PromptEditorMode;
  customPromptDirty: boolean;
  enabledInvariantIds: string[];
  variableValues: Record<string, string>;
  enabledModifierNames: string[];
  modifierValues: Record<string, string>;
  adjustments: InvariantAdjustment[];
  customTemplate?: string;
}

/**
 * 快速复刻确认快照（ADR-2）：intent/detail/policy 为字面量类型，类型层不可写成其他值；
 * generationSettings 排除 aspectRatio（画幅由 reference_or_fallback 策略解析，架构 §6.1）。
 */
export interface QuickGenerationAuthorizationSnapshot {
  schemaVersion: 1;
  intent: "reconstruction";
  detailLevel: "standard";
  aspectRatioPolicy: "reference_or_fallback";
  generationSettings: Omit<GenerationParams, "aspectRatio">;
}

/** 编译后 Prompt 的可追溯来源片段；字符范围对应 CompiledPrompt.text */
export interface CompiledPromptSegment {
  sourceKind: "content" | "invariant" | "observation" | "modifier" | "adjustment";
  sourceId: string;
  dimension?: StyleDimension;
  startIndex: number;
  endIndex: number;
}

/** 确定性 Prompt 编译产物（无 LLM 二次改写，架构 §6.2） */
export interface CompiledPrompt {
  text: string;
  segments: CompiledPromptSegment[];
}

/** 方向结果条目（GET /api/generation?view=direction，架构 §7.2） */
export interface DirectionIterationListItem extends IterationListItem {
  resultAssetId: string | null;
  errorMessage: string | null;
}

/** 方向 feed：五成功 + 一进行中 + 一最近失败，三组不共享名额（ADR-5） */
export interface DirectionIterationFeed {
  completed: DirectionIterationListItem[];
  active: DirectionIterationListItem | null;
  latestFailure: DirectionIterationListItem | null;
}

/** 视觉分析 Provider */
export type VisionProviderName = 'replicate' | 'gemini';

/** 结构化整理 Provider */
export type StructurerProviderName = 'replicate' | 'gemini';

/** 图像生成 Provider */
export type ImageGenProviderName = 'replicate' | 'fal' | 'gemini';

/** 分析任务状态 */
export type AnalysisTaskStatus = "pending" | "processing" | "completed" | "failed";

/** 分析任务错误阶段 */
export type AnalysisTaskErrorStage = "vision" | "llm";

/** 分析自动模板状态 */
export type AnalysisTemplateStatus = "ready" | "partial" | "fallback";

/** 分析自动模板Variables来源字段 */
export type AnalysisTemplateSourceField =
  | "subject"
  | "scene"
  | "visual_style"
  | "lighting_color"
  | "composition"
  | "camera_language"
  | "texture"
  | "mood"
  | ContentVariableSourceField;

/** 分析任务 */
export interface AnalysisTask {
  id: string;
  sourceAssetId: string;
  status: AnalysisTaskStatus;
  recipe: StoredVisualRecipe | null;
  promptText: string | null;
  negativePromptText: string | null;
  rawResponse: string | null;
  errorMessage: string | null;
  errorStage: AnalysisTaskErrorStage | null;
  analysisTemplateContent: string | null;
  analysisTemplateVariables: TemplateVariable[];
  analysisTemplateStatus: AnalysisTemplateStatus | null;
  analysisTemplateReason: string | null;
  provider: VisionProviderName;
  externalId: string | null;
  modelName: string | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 生成参数 */
export interface GenerationParams {
  aspectRatio: string;
  quality: string;
  /** models.json 中的稳定模型 id；缺省时服务端按配置默认模型解析 */
  model?: string;
}

/** Generation Task状态 */
export type GenerationTaskStatus = "pending" | "processing" | "completed" | "failed";

/** Generation Task */
export interface GenerationTask {
  id: string;
  analysisTaskId: string;
  status: GenerationTaskStatus;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
  provider: ImageGenProviderName;
  externalId: string | null;
  resultAssetId: string | null;
  errorMessage: string | null;
  userId: string | null;
  /** plan-01（ADR-2）: 提交时服务端固化的配方快照；存量旧行为 null，详情回退活引用 */
  recipeSnapshot: StoredVisualRecipe | null;
  /** plan-01（ADR-2）: 提交时服务端固化的变量快照；存量旧行为 null */
  variablesSnapshot: TemplateVariable[] | null;
  /** plan-03（ADR-4）: 提交时固化的 Prompt 控制快照；存量旧行为 null，消费端全文降级 */
  promptControlSnapshot: PromptControlSnapshot | null;
  /** plan-01（AC-02）: 提交时工作台应用的 Style Memory id，可空 */
  sourceTemplateId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 迭代展示态状态（数据库 pending 归并为 processing，架构 §7.6） */
export type IterationDisplayStatus = "processing" | "completed" | "failed";

/** 迭代列表查询参数状态（GET /api/generation?status=，默认 completed 兼容近期迭代条） */
export type IterationStatusFilter = "all" | "processing" | "completed" | "failed";

/** 迭代上下文来源标记（快照优先 / 活引用回退 / 缺失，架构 §6.2） */
export type IterationContextSource = "snapshot" | "fallback" | "missing";

/** 迭代列表条目（GET /api/generation 条目 DTO，架构 §7.2；既有字段 id/resultFileUrl/createdAt 保留） */
export interface IterationListItem {
  id: string;
  status: IterationDisplayStatus;
  /** 服务端截断前 120 字符 */
  promptSummary: string;
  resultFileUrl: string | null;
  params: GenerationParams;
  /** ISO 8601 */
  createdAt: string;
}

/** 迭代详情（GET /api/generation/[id] DTO，架构 §7.2；为既有轮询消费字段的超集） */
export interface IterationDetail {
  id: string;
  analysisTaskId: string;
  status: IterationDisplayStatus;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
  resultFileUrl: string | null;
  errorMessage: string | null;
  recipe: StoredVisualRecipe | null;
  recipeSource: IterationContextSource;
  variables: TemplateVariable[];
  variablesSource: IterationContextSource;
  /** null 即来源图缺失标记（前端缺失提示依据） */
  sourceImageUrl: string | null;
  /** 所引用 analysis task 的来源资产 id；保存预填依赖，缺失为 null */
  sourceAssetId: string | null;
  /** 提交时应用的 Style Memory id（恢复链路还原"当前应用模板"，消费方见 plan-04） */
  sourceTemplateId: string | null;
  sourceTemplateName: string | null;
  savedTemplate: { id: string; name: string } | null;
  /** 兼容字段：use-history-restore 依赖其做变量回退 */
  analysisTemplateVariables: TemplateVariable[];
  /** plan-03（ADR-4）: 提交时 Prompt 控制快照；旧任务为 null，消费端以 promptSnapshot 全文降级 */
  promptControlSnapshot: PromptControlSnapshot | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

/** 模板Variables定义 */
export interface TemplateVariable {
  name: string;           // Variable name，支持中文、空格、下划线和横线
  defaultValue: string;   // 默认值，用户未填值时使用
  label?: string;         // 展示标签，缺失时回退到 name
  sourceField?: AnalysisTemplateSourceField; // 自动模板Variables来源
}

/** Prompt 模板 */
export interface PromptTemplate {
  id: string;                        // ULID
  name: string;                      // Template Name，1-50 字符
  content: string;                   // 模板正文（含 {{var}} 标记的 prompt 文本）
  variables: TemplateVariable[];     // Variables定义列表（从 content 自动提取）
  sourceAssetId: string | null;       // 关联的引用图Asset ID
  sourceImageUrl: string | null;      // 模板库预览用引用图URL快照
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── plan-01（可验证 Style Memory，架构 §7.2） ─────────────────────────────

/** 验证状态（DB varchar(20) + CHECK 约束）；只能由服务端写点派生（ADR-1） */
export type TemplateVerificationStatus = "user_verified" | "pending_verification";

/** templates 行（repository 层读出；列表/详情 DTO 由此序列化，架构 §7.2） */
export interface StyleMemoryRecord {
  id: string;                            // ULID, system_generated
  name: string;                          // user_input, 1-50
  description: string | null;            // user_input, ≤500
  content: string;                       // 完整提示（高级信息）, ≤10000
  variables: TemplateVariable[];         // 用户确认, ≤20 项（既有结构）
  retainedRules: string[];               // user_input, ≤12 条 × ≤200 字符（可编辑，触发回退）
  negativeConstraints: string[];         // user_input, ≤12 条 × ≤200 字符（可编辑，触发回退）
  styleTokens: string[];                 // 保存时快照, ≤16 条 × ≤80 字符（仅展示）
  enhancementHints: string[];            // 保存时快照, ≤16 条 × ≤80 字符（仅展示）
  verificationStatus: TemplateVerificationStatus; // derived（服务端，ADR-1）
  representativeGenerationTaskId: string | null;  // user 选择 + 服务端校验（ADR-2）
  sourceAssetId: string | null;          // frontend_computed（既有）
  sourceImageUrl: string | null;         // derived from asset（既有）
  sourceGenerationTaskId: string | null; // frontend_computed（既有）
  userId: string;                        // system_generated（session）
  createdAt: Date;
  updatedAt: Date;
}

/** GET /api/templates 列表条目（架构 §7.2；日期为 ISO 字符串） */
export interface StyleMemoryListItem {
  id: string;
  name: string;
  verificationStatus: TemplateVerificationStatus;
  /** 前 2 条（卡片摘要） */
  retainedRulesPreview: string[];
  variableCount: number;
  /** 来源图（卡片次预览/pending 卡主预览） */
  sourceImageUrl: string | null;
  /** 代表结果图（已验证主预览） */
  representativeImageUrl: string | null;
  /** ISO 8601，无使用为 null（显示"尚未使用"） */
  lastUsedAt: string | null;
  updatedAt: string;
}

/** GET /api/templates/[id] 详情（含高级信息与使用情况，架构 §7.2） */
export interface StyleMemoryDetail extends Omit<StyleMemoryRecord, "createdAt" | "updatedAt"> {
  /** 来源 Iteration */
  sourceGenerationTask: { id: string; createdAt: string } | null;
  representativeResult: { iterationId: string; imageUrl: string | null; createdAt: string } | null;
  usage: { lastUsedAt: string | null; derivedIterationCount: number };
  createdAt: string;
  updatedAt: string;
}

/** 代表结果候选条目（架构 §7.2） */
export interface RepresentativeCandidate {
  /** generation task id */
  id: string;
  /** result asset fileUrl */
  imageUrl: string | null;
  /** 服务端截断 120 字符（既有口径） */
  promptSummary: string;
  createdAt: string;
}

/**
 * POST /api/templates 请求体（架构 §7.3，plan-02 消费）。
 * 不含 verificationStatus：状态只能由服务端派生（ADR-1）。
 */
export interface SaveStyleMemoryRequest {
  name: string;
  description?: string;
  content: string;
  variables?: TemplateVariable[];
  retainedRules?: string[];
  negativeConstraints?: string[];
  styleTokens?: string[];
  enhancementHints?: string[];
  sourceAssetId?: string;
  sourceGenerationTaskId?: string;
  /** 须等于 sourceGenerationTaskId（API 层校验，repository 不重复查） */
  representativeGenerationTaskId?: string;
}

/**
 * PUT /api/templates/[id] 请求体（架构 §7.3，plan-02 消费）。
 * 不含 verificationStatus：回退由服务端按规则集合判定（§6.4 算法）。
 */
export interface UpdateStyleMemoryRequest {
  name?: string;
  description?: string | null;
  /** 仅默认值编辑（架构 §7.3） */
  variables?: TemplateVariable[];
  retainedRules?: string[];
  negativeConstraints?: string[];
  /** 兼容既有工作台链路；不触发状态回退（验证只对规则集合成立） */
  content?: string;
}
