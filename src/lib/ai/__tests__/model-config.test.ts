import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveImageGenModel,
  resolveVisionModel,
  resolveStructurerModel,
  UnknownModelError,
  IMAGE_GEN_MODEL_OPTIONS,
  DEFAULT_IMAGE_GEN_MODEL_ID,
  isKnownImageGenModel,
} from "../model-config";

/** 以替换 models.json 的方式重放模块级配置校验 */
async function importModelConfigWith(rawJson: unknown) {
  vi.resetModules();
  vi.doMock("../models.json", () => ({ default: rawJson }));
  try {
    return await import("../model-config");
  } finally {
    vi.doUnmock("../models.json");
    vi.resetModules();
  }
}

function validConfig(): Record<string, unknown> {
  return {
    imageGen: {
      defaultModel: "model-a",
      models: [
        {
          id: "model-a",
          label: "Model A",
          providers: [
            { provider: "replicate", modelId: "owner/model-a", isDefault: true },
            { provider: "fal", modelId: "fal-ai/model-a" },
          ],
        },
        {
          id: "model-b",
          label: "Model B",
          providers: [{ provider: "gemini", modelId: "gemini-model-b", isDefault: true }],
        },
      ],
    },
    vision: {
      defaultModel: "vision-a",
      models: [
        {
          id: "vision-a",
          label: "Vision A",
          providers: [
            { provider: "replicate", modelId: "owner/vision-a", isDefault: true },
            { provider: "gemini", modelId: "gemini-vision-a" },
          ],
        },
      ],
    },
    structurer: {
      defaultModel: "vision-a",
      models: [
        {
          id: "vision-a",
          label: "Vision A",
          providers: [
            { provider: "replicate", modelId: "owner/vision-a", isDefault: true },
            { provider: "gemini", modelId: "gemini-vision-a" },
          ],
        },
      ],
    },
  };
}

describe("model-config 解析", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.IMAGE_GEN_PROVIDER;
    delete process.env.VISION_PROVIDER;
    delete process.env.STRUCTURER_PROVIDER;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe("resolveImageGenModel", () => {
    it("未指定模型且无 env 时返回配置默认模型的默认绑定", () => {
      expect(resolveImageGenModel()).toEqual({
        modelId: "flux-2-dev",
        label: "FLUX.2 [dev]",
        provider: "replicate",
        providerModelId: "black-forest-labs/flux-2-dev",
      });
    });

    it("指定模型时使用该模型的默认 provider 绑定", () => {
      expect(resolveImageGenModel("nano-banana-2-lite")).toMatchObject({
        modelId: "nano-banana-2-lite",
        provider: "gemini",
        providerModelId: "gemini-3.1-flash-lite-image",
      });
    });

    it("未知模型 id 抛出 UnknownModelError", () => {
      expect(() => resolveImageGenModel("not-a-model")).toThrow(UnknownModelError);
      expect(() => resolveImageGenModel("not-a-model")).toThrow(
        "Unknown imageGen model: not-a-model"
      );
    });

    it("env 指定的 provider 服务于所选模型时优先于默认绑定", () => {
      process.env.IMAGE_GEN_PROVIDER = "fal";
      expect(resolveImageGenModel("flux-2-dev")).toMatchObject({
        provider: "fal",
        providerModelId: "fal-ai/flux-2",
      });
    });

    it("env 指定的 provider 不服务于所选模型时回退模型默认绑定", () => {
      process.env.IMAGE_GEN_PROVIDER = "gemini";
      expect(resolveImageGenModel("flux-2-dev")).toMatchObject({
        provider: "replicate",
        providerModelId: "black-forest-labs/flux-2-dev",
      });
    });

    it("未指定模型时 env 驱动模型选择：优先 env 为默认绑定的模型", () => {
      process.env.IMAGE_GEN_PROVIDER = "gemini";
      expect(resolveImageGenModel()).toMatchObject({
        modelId: "nano-banana-2-lite",
        provider: "gemini",
      });
    });

    it("未指定模型时 env 无默认绑定模型则选任意支持 env 的模型", () => {
      process.env.IMAGE_GEN_PROVIDER = "fal";
      expect(resolveImageGenModel()).toMatchObject({
        modelId: "flux-2-dev",
        provider: "fal",
        providerModelId: "fal-ai/flux-2",
      });
    });

    it("env 为非法 provider 名称时抛出既有错误文案", () => {
      process.env.IMAGE_GEN_PROVIDER = "unknown";
      expect(() => resolveImageGenModel()).toThrow(
        "Unknown image gen provider: unknown"
      );
    });
  });

  describe("resolveVisionModel / resolveStructurerModel", () => {
    it("默认走 replicate 绑定", () => {
      expect(resolveVisionModel()).toMatchObject({
        provider: "replicate",
        providerModelId: "google/gemini-2.5-flash",
      });
      expect(resolveStructurerModel()).toMatchObject({
        provider: "replicate",
      });
    });

    it("VISION_PROVIDER=gemini 时切换到 gemini 绑定", () => {
      process.env.VISION_PROVIDER = "gemini";
      expect(resolveVisionModel()).toMatchObject({
        provider: "gemini",
        providerModelId: "gemini-2.5-flash",
      });
      expect(resolveStructurerModel()).toMatchObject({
        provider: "gemini",
        providerModelId: "gemini-2.5-flash",
      });
    });

    it("STRUCTURER_PROVIDER 覆盖 VISION_PROVIDER 链", () => {
      process.env.VISION_PROVIDER = "gemini";
      process.env.STRUCTURER_PROVIDER = "replicate";
      expect(resolveStructurerModel()).toMatchObject({ provider: "replicate" });
    });

    it("env 非法名称时抛出既有错误文案", () => {
      process.env.VISION_PROVIDER = "unknown";
      expect(() => resolveVisionModel()).toThrow("Unknown vision provider: unknown");
      expect(() => resolveStructurerModel()).toThrow(
        "Unknown structurer provider: unknown"
      );
    });
  });

  describe("前端目录导出", () => {
    it("导出全部模型选项与默认模型 id", () => {
      expect(IMAGE_GEN_MODEL_OPTIONS.map((option) => option.id)).toEqual([
        "flux-2-dev",
        "nano-banana-2-lite",
        "nano-banana-2-pro",
      ]);
      expect(DEFAULT_IMAGE_GEN_MODEL_ID).toBe("flux-2-dev");
    });

    it("isKnownImageGenModel 做目录白名单校验", () => {
      expect(isKnownImageGenModel("flux-2-dev")).toBe(true);
      expect(isKnownImageGenModel("legacy-model")).toBe(false);
    });
  });
});

describe("models.json 加载期校验", () => {
  it("imageGen 模型 id 重复时拒绝加载", async () => {
    const config = validConfig();
    (config.imageGen as { models: Array<{ id: string }> }).models[1].id = "model-a";
    await expect(importModelConfigWith(config)).rejects.toThrow(
      'duplicate model id "model-a" in "imageGen"'
    );
  });

  it("模型缺少默认 provider 绑定时拒绝加载", async () => {
    const config = validConfig();
    const models = (config.imageGen as {
      models: Array<{ providers: Array<Record<string, unknown>> }>;
    }).models;
    delete models[0].providers[0].isDefault;
    await expect(importModelConfigWith(config)).rejects.toThrow(
      'model "model-a" must declare exactly one default provider (found 0)'
    );
  });

  it("绑定使用阶段不允许的 provider 时拒绝加载", async () => {
    const config = validConfig();
    const models = (config.imageGen as {
      models: Array<{ providers: Array<Record<string, unknown>> }>;
    }).models;
    models[1].providers[0].provider = "openai";
    await expect(importModelConfigWith(config)).rejects.toThrow(
      'model "model-b" has unknown provider "openai"'
    );
  });

  it("defaultModel 未收录在 models 列表时拒绝加载", async () => {
    const config = validConfig();
    (config.imageGen as { defaultModel: string }).defaultModel = "missing-model";
    await expect(importModelConfigWith(config)).rejects.toThrow(
      '"imageGen.defaultModel" (missing-model) is not listed in "imageGen.models"'
    );
  });

  it("模型 providers 为空数组时拒绝加载", async () => {
    const config = validConfig();
    (config.imageGen as { models: Array<{ providers: unknown[] }> }).models[1].providers = [];
    await expect(importModelConfigWith(config)).rejects.toThrow(
      'model "model-b" must declare at least one provider'
    );
  });
});
