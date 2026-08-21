import rawModelsConfig from "./models.json";
import type {
  ImageGenProviderName,
  StructurerProviderName,
  VisionProviderName,
} from "@/types/models";

/**
 * 模型 → Provider 映射的唯一事实源（SSOT）：src/lib/ai/models.json
 *
 * 每个模型可绑定多个 provider（各自携带 provider 侧模型标识）并声明一个默认绑定；
 * 请求/环境未指定时走 defaultModel，环境变量指定的 provider 若服务于该模型则优先生效。
 */

export type ModelStage = "imageGen" | "vision" | "structurer";

/** 单个模型在某个 provider 上的绑定 */
export interface ModelProviderBinding<P extends string = string> {
  provider: P;
  /** provider 侧的模型标识（如 black-forest-labs/flux-2-dev） */
  modelId: string;
  /** 该模型的默认 provider；每个模型恰好一个 */
  isDefault?: boolean;
}

/** 模型目录条目 */
export interface StageModelConfig<P extends string = string> {
  /** 跨 provider 稳定的模型 id，落库到 generation params.model */
  id: string;
  label: string;
  description?: string;
  providers: ModelProviderBinding<P>[];
}

interface StageConfig<P extends string> {
  defaultModel: string;
  models: StageModelConfig<P>[];
}

/** 解析结果：选定模型 + 实际使用的 provider 及其模型标识 */
export interface ResolvedModelBinding<P extends string = string> {
  modelId: string;
  label: string;
  provider: P;
  providerModelId: string;
}

/** 请求携带了 models.json 未收录的模型 id */
export class UnknownModelError extends Error {
  constructor(stage: ModelStage, modelId: string) {
    super(`Unknown ${stage} model: ${modelId}`);
    this.name = "UnknownModelError";
  }
}

/** models.json 结构违例（模块加载即 fail fast） */
export class InvalidModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModelConfigError";
  }
}

const IMAGE_GEN_ALLOWED_PROVIDERS = ["replicate", "fal", "gemini"] as const;
const VISION_ALLOWED_PROVIDERS = ["replicate", "gemini"] as const;

/** 工厂历史错误文案，保持 env 值非法时的既有报错语义 */
const STAGE_PROVIDER_LABELS: Record<ModelStage, string> = {
  imageGen: "image gen",
  vision: "vision",
  structurer: "structurer",
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseStageConfig<P extends string>(
  stage: ModelStage,
  raw: unknown,
  allowedProviders: readonly P[]
): StageConfig<P> {
  if (!raw || typeof raw !== "object") {
    throw new InvalidModelConfigError(`models.json: "${stage}" must be an object`);
  }

  const stageObj = raw as Record<string, unknown>;
  if (!isNonEmptyString(stageObj.defaultModel)) {
    throw new InvalidModelConfigError(
      `models.json: "${stage}.defaultModel" must be a non-empty string`
    );
  }
  if (!Array.isArray(stageObj.models) || stageObj.models.length === 0) {
    throw new InvalidModelConfigError(
      `models.json: "${stage}.models" must be a non-empty array`
    );
  }

  const seenModelIds = new Set<string>();
  const models = stageObj.models.map((rawModel) => {
    if (!rawModel || typeof rawModel !== "object") {
      throw new InvalidModelConfigError(
        `models.json: "${stage}.models[]" entries must be objects`
      );
    }
    const model = rawModel as Record<string, unknown>;

    if (!isNonEmptyString(model.id)) {
      throw new InvalidModelConfigError(
        `models.json: "${stage}.models[].id" must be a non-empty string`
      );
    }
    if (seenModelIds.has(model.id)) {
      throw new InvalidModelConfigError(
        `models.json: duplicate model id "${model.id}" in "${stage}"`
      );
    }
    seenModelIds.add(model.id);

    if (!isNonEmptyString(model.label)) {
      throw new InvalidModelConfigError(
        `models.json: model "${model.id}" must have a non-empty label`
      );
    }

    if (!Array.isArray(model.providers) || model.providers.length === 0) {
      throw new InvalidModelConfigError(
        `models.json: model "${model.id}" must declare at least one provider`
      );
    }

    const seenProviders = new Set<string>();
    let defaultCount = 0;
    const providers = model.providers.map((rawBinding) => {
      if (!rawBinding || typeof rawBinding !== "object") {
        throw new InvalidModelConfigError(
          `models.json: model "${model.id}" provider bindings must be objects`
        );
      }
      const binding = rawBinding as Record<string, unknown>;

      if (
        typeof binding.provider !== "string" ||
        !(allowedProviders as readonly string[]).includes(binding.provider)
      ) {
        throw new InvalidModelConfigError(
          `models.json: model "${model.id}" has unknown provider "${String(
            binding.provider
          )}" (allowed: ${allowedProviders.join(", ")})`
        );
      }
      if (seenProviders.has(binding.provider)) {
        throw new InvalidModelConfigError(
          `models.json: model "${model.id}" declares provider "${binding.provider}" more than once`
        );
      }
      seenProviders.add(binding.provider);

      if (!isNonEmptyString(binding.modelId)) {
        throw new InvalidModelConfigError(
          `models.json: model "${model.id}" binding for "${binding.provider}" must have a non-empty modelId`
        );
      }

      const isDefault = binding.isDefault === true;
      if (isDefault) defaultCount += 1;
      if (binding.isDefault !== undefined && typeof binding.isDefault !== "boolean") {
        throw new InvalidModelConfigError(
          `models.json: model "${model.id}" binding isDefault must be a boolean`
        );
      }

      return {
        provider: binding.provider as P,
        modelId: binding.modelId,
        ...(isDefault ? { isDefault: true } : {}),
      };
    });

    if (defaultCount !== 1) {
      throw new InvalidModelConfigError(
        `models.json: model "${model.id}" must declare exactly one default provider (found ${defaultCount})`
      );
    }

    return {
      id: model.id,
      label: model.label,
      ...(typeof model.description === "string" && model.description.trim()
        ? { description: model.description }
        : {}),
      providers,
    };
  });

  if (!models.some((model) => model.id === stageObj.defaultModel)) {
    throw new InvalidModelConfigError(
      `models.json: "${stage}.defaultModel" (${stageObj.defaultModel}) is not listed in "${stage}.models"`
    );
  }

  return { defaultModel: stageObj.defaultModel, models };
}

const rawConfig = rawModelsConfig as unknown as Record<string, unknown>;

const imageGenStage = parseStageConfig(
  "imageGen",
  rawConfig.imageGen,
  IMAGE_GEN_ALLOWED_PROVIDERS
);
const visionStage = parseStageConfig(
  "vision",
  rawConfig.vision,
  VISION_ALLOWED_PROVIDERS
);
const structurerStage = parseStageConfig(
  "structurer",
  rawConfig.structurer,
  VISION_ALLOWED_PROVIDERS
);

function resolveStage<P extends string>(
  stage: ModelStage,
  stageConfig: StageConfig<P>,
  modelId: string | undefined,
  envProvider: string | undefined,
  allowedProviders: readonly P[]
): ResolvedModelBinding<P> {
  const hasEnvProvider = envProvider !== undefined && envProvider !== "";
  if (hasEnvProvider && !(allowedProviders as readonly string[]).includes(envProvider)) {
    throw new Error(
      `Unknown ${STAGE_PROVIDER_LABELS[stage]} provider: ${envProvider}`
    );
  }

  let model: StageModelConfig<P> | undefined;
  if (modelId !== undefined && modelId !== "") {
    model = stageConfig.models.find((candidate) => candidate.id === modelId);
    if (!model) {
      throw new UnknownModelError(stage, modelId);
    }
  } else if (hasEnvProvider) {
    // 未指定模型时保留 env 驱动的 Provider 选择：优先 env 为默认绑定的模型，
    // 其次任意支持 env 的模型（维持 IMAGE_GEN_PROVIDER=gemini 等既有部署行为）
    model =
      stageConfig.models.find((candidate) =>
        candidate.providers.some(
          (binding) => binding.provider === envProvider && binding.isDefault
        )
      ) ??
      stageConfig.models.find((candidate) =>
        candidate.providers.some((binding) => binding.provider === envProvider)
      );
  }
  model ??= stageConfig.models.find(
    (candidate) => candidate.id === stageConfig.defaultModel
  );
  if (!model) {
    // 加载期校验已保证存在，防御性兜底
    throw new InvalidModelConfigError(
      `models.json: "${stage}.defaultModel" (${stageConfig.defaultModel}) is not listed in "${stage}.models"`
    );
  }

  // env 指定的 provider 服务于该模型时优先，否则用模型默认绑定
  const selected =
    (hasEnvProvider
      ? model.providers.find((candidate) => candidate.provider === envProvider)
      : undefined) ??
    (model.providers.find((candidate) => candidate.isDefault) as ModelProviderBinding<P>);

  return {
    modelId: model.id,
    label: model.label,
    provider: selected.provider,
    providerModelId: selected.modelId,
  };
}

/** 解析图像生成模型：请求未携带 model 时使用配置默认模型 */
export function resolveImageGenModel(
  modelId?: string
): ResolvedModelBinding<ImageGenProviderName> {
  return resolveStage(
    "imageGen",
    imageGenStage,
    modelId,
    process.env.IMAGE_GEN_PROVIDER,
    IMAGE_GEN_ALLOWED_PROVIDERS
  );
}

/** 解析视觉分析模型（服务端按配置与环境选择，无请求入口） */
export function resolveVisionModel(
  modelId?: string
): ResolvedModelBinding<VisionProviderName> {
  return resolveStage(
    "vision",
    visionStage,
    modelId,
    process.env.VISION_PROVIDER,
    VISION_ALLOWED_PROVIDERS
  );
}

/** 解析结构化整理模型（保留 STRUCTURER_PROVIDER → VISION_PROVIDER 环境链） */
export function resolveStructurerModel(
  modelId?: string
): ResolvedModelBinding<StructurerProviderName> {
  return resolveStage(
    "structurer",
    structurerStage,
    modelId,
    process.env.STRUCTURER_PROVIDER || process.env.VISION_PROVIDER,
    VISION_ALLOWED_PROVIDERS
  );
}

/** 前端模型选择器可安全消费的目录（纯数据，无 server-only 依赖） */
export interface ImageGenModelOption {
  id: string;
  label: string;
  description?: string;
}

export const IMAGE_GEN_MODEL_OPTIONS: readonly ImageGenModelOption[] = Object.freeze(
  imageGenStage.models.map((model) => ({
    id: model.id,
    label: model.label,
    ...(model.description ? { description: model.description } : {}),
  }))
);

export const DEFAULT_IMAGE_GEN_MODEL_ID: string = imageGenStage.defaultModel;

/** 恢复链路/本地存储的模型 id 白名单校验 */
export function isKnownImageGenModel(modelId: string): boolean {
  return imageGenStage.models.some((model) => model.id === modelId);
}
