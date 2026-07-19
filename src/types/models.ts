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
  createdAt: Date;
  updatedAt: Date;
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
