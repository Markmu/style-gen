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
  createdAt: Date;
}

/** 视觉配方 — AI 两阶段链路提取的结构化风格描述 */
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

/** 分析任务状态 */
export type AnalysisTaskStatus = "pending" | "processing" | "completed" | "failed";

/** 分析任务错误阶段 */
export type AnalysisTaskErrorStage = "vision" | "llm";

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
  createdAt: Date;
  updatedAt: Date;
}

/** 生成参数 */
export interface GenerationParams {
  aspectRatio: string;
  quality: string;
}

/** 生成任务状态 */
export type GenerationTaskStatus = "pending" | "processing" | "completed" | "failed";

/** 生成任务 */
export interface GenerationTask {
  id: string;
  analysisTaskId: string;
  status: GenerationTaskStatus;
  promptSnapshot: string;
  negativePromptSnapshot: string;
  params: GenerationParams;
  modelName: string;
  resultAssetId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}
