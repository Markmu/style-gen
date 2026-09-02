import { FalImageGenProvider, ImageGenError } from "../fal-image-gen";

// Mock @fal-ai/client
const mockSubscribe = vi.fn();
vi.mock("@fal-ai/client", () => ({
  createFalClient: vi.fn(() => ({
    subscribe: mockSubscribe,
  })),
}));

import { createFalClient } from "@fal-ai/client";

const defaultParams = {
  prompt: "a beautiful landscape",
  negativePrompt: "ugly, blurry",
  aspectRatio: "1:1",
  quality: "high",
};

const fakeFalImage = {
  url: "https://fal.ai/tmp/result.webp",
  width: 1024,
  height: 1024,
  content_type: "image/webp",
};

function generate(params: Partial<typeof defaultParams> = {}) {
  const provider = new FalImageGenProvider();
  return provider.generate({ ...defaultParams, ...params });
}

describe("FalImageGenProvider", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV, FAL_KEY: "test-fal-key" };
    mockSubscribe.mockReset();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // 1. P0: 正常生成
  it("应正常返回同步生成的图片信息", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    const result = await generate();

    expect(result).toEqual({
      mode: "sync",
      imageUrl: fakeFalImage.url,
      width: fakeFalImage.width,
      height: fakeFalImage.height,
    });
  });

  // 2. P0: 缺少 FAL_KEY
  it("缺少 FAL_KEY 时应抛出 ImageGenError", async () => {
    delete process.env.FAL_KEY;

    try {
      await generate();
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenError);
      expect((error as ImageGenError).message).toBe("FAL_KEY is not configured");
    }
  });

  // 3. P0: 超时 120s
  it("超时 120s应抛出 ImageGenError", async () => {
    vi.useFakeTimers();

    // subscribe 永远不 resolve
    mockSubscribe.mockReturnValueOnce(new Promise(() => {}));

    const promise = generate();

    // 快进 120s
    vi.advanceTimersByTime(120_000);

    try {
      await promise;
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenError);
      expect((error as ImageGenError).message).toBe(
        "Image generation timed out after 120s"
      );
    }

    vi.useRealTimers();
  });

  // 4. P0: 模型无返回图片 (images: [])
  it("模型返回空 images 数组时应抛出 ImageGenError", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [] },
    });

    try {
      await generate();
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenError);
      expect((error as ImageGenError).message).toBe("Model returned no images");
    }
  });

  // 5. P0: images 为 null
  it("模型返回 images 为 null 时应抛出 ImageGenError", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: null },
    });

    try {
      await generate();
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenError);
      expect((error as ImageGenError).message).toBe("Model returned no images");
    }
  });

  // 6. P0: API 调用异常
  it("API 调用异常时应抛出 ImageGenError 并包装原始错误", async () => {
    mockSubscribe.mockRejectedValueOnce(new Error("network error"));

    try {
      await generate();
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenError);
      expect((error as ImageGenError).message).toBe(
        "Image generation failed: network error"
      );
    }
  });

  // 7. P1: ImageGenError 透传
  it("内部抛出的 ImageGenError 应直接透传", async () => {
    const original = new ImageGenError("custom error from model");
    mockSubscribe.mockRejectedValueOnce(original);

    await expect(generate()).rejects.toThrow(original);
  });

  // 8. P0: webhookUrl 被忽略（fal 为同步调用）
  it("webhookUrl 参数不应传递给底层模型调用", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    const provider = new FalImageGenProvider();
    const result = await provider.generate({
      ...defaultParams,
      webhookUrl: "https://example.com/webhook",
    });

    expect(result.mode).toBe("sync");
    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux-2",
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: defaultParams.prompt,
          image_size: "square",
          num_images: 1,
        }),
      })
    );
  });

  // 9. P0: aspectRatio 映射 16:9 -> landscape_16_9
  it("aspectRatio 16:9 应映射为 landscape_16_9", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generate({ aspectRatio: "16:9" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux-2",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "landscape_16_9",
        }),
      })
    );
  });

  // 10. P0: aspectRatio 映射 4:3 -> landscape_4_3
  it("aspectRatio 4:3 应映射为 landscape_4_3", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generate({ aspectRatio: "4:3" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux-2",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "landscape_4_3",
        }),
      })
    );
  });

  // 11. P0: aspectRatio 映射 1:1 -> square
  it("aspectRatio 1:1 应映射为 square", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generate({ aspectRatio: "1:1" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux-2",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "square",
        }),
      })
    );
  });

  // 12. P0: aspectRatio 映射 3:4 -> portrait_4_3（plan-01 §4：完整映射公开画幅）
  it("aspectRatio 3:4 应映射为 portrait_4_3", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generate({ aspectRatio: "3:4" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux-2",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "portrait_4_3",
        }),
      })
    );
  });

  // 13. P0: aspectRatio 映射 9:16 -> portrait_16_9（plan-01 §4）
  it("aspectRatio 9:16 应映射为 portrait_16_9", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generate({ aspectRatio: "9:16" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux-2",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "portrait_16_9",
        }),
      })
    );
  });

  // 14. P0: 未知 aspectRatio 在调用 Provider 前拒绝，禁止静默回退 square（plan-01 §4 / 后端边界场景）
  it("未知 aspectRatio 应在调用 Provider 前抛可识别校验错误（不回退 square）", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await expect(generate({ aspectRatio: "3:2" })).rejects.toThrowError(ImageGenError);
    await expect(generate({ aspectRatio: "3:2" })).rejects.toThrowError(/3:2/);

    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  // 15. P1: 使用正确模型 (fal-ai/flux-2)
  it("应使用 fal-ai/flux-2 模型", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generate();

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux-2",
      expect.any(Object)
    );
  });

  // 16. P1: num_images 为 1
  it("num_images 应为 1", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generate();

    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({
          num_images: 1,
        }),
      })
    );
  });

  // 17. P2: 非 Error 异常
  it("非 Error 异常应包装为 ImageGenError 并使用 Unknown 消息", async () => {
    mockSubscribe.mockRejectedValueOnce("string error");

    try {
      await generate();
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenError);
      expect((error as ImageGenError).message).toBe(
        "Image generation failed: Unknown image generation error"
      );
    }
  });

  // 验证 createFalClient 使用了正确的 credentials
  it("应使用 FAL_KEY 初始化 client", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generate();

    expect(createFalClient).toHaveBeenCalledWith({
      credentials: "test-fal-key",
    });
  });
});
