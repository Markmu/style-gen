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

/** Visual Recipe — AI 两阶段链路提取的结构化风格描述 */
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
  | "mood";

/** 分析任务 */
export interface AnalysisTask {
  id: string;
  sourceAssetId: string;
  status: AnalysisTaskStatus;
  recipe: VisualRecipe | null;
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
  name: string;           // Variable name，匹配 [a-zA-Z_]\w* 格式
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
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
