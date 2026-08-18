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

/** 视觉分析 Provider */
export type VisionProviderName = 'replicate' | 'gemini';

/** 图像生成 Provider */
export type ImageGenProviderName = 'replicate' | 'fal';

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
