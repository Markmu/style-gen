import { generateImage, ImageGenError } from "../image-gen";

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

describe("generateImage", () => {
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
  it("应正常返回生成的图片信息", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    const result = await generateImage(defaultParams);

    expect(result).toEqual({
      imageUrl: fakeFalImage.url,
      width: fakeFalImage.width,
      height: fakeFalImage.height,
    });
  });

  // 2. P0: 缺少 FAL_KEY
  it("缺少 FAL_KEY 时应抛出 ImageGenError", async () => {
    delete process.env.FAL_KEY;

    try {
      await generateImage(defaultParams);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenError);
      expect((error as ImageGenError).message).toBe("FAL_KEY is not configured");
    }
  });

  // 3. P0: 超时 120 秒
  it("超时 120 秒应抛出 ImageGenError", async () => {
    vi.useFakeTimers();

    // subscribe 永远不 resolve
    mockSubscribe.mockReturnValueOnce(new Promise(() => {}));

    const promise = generateImage(defaultParams);

    // 快进 120 秒
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
      await generateImage(defaultParams);
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
      await generateImage(defaultParams);
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
      await generateImage(defaultParams);
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

    await expect(generateImage(defaultParams)).rejects.toThrow(original);
  });

  // 8. P0: aspectRatio 映射 16:9 -> landscape_16_9
  it("aspectRatio 16:9 应映射为 landscape_16_9", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generateImage({ ...defaultParams, aspectRatio: "16:9" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux/dev",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "landscape_16_9",
        }),
      })
    );
  });

  // 9. P0: aspectRatio 映射 4:3 -> landscape_4_3
  it("aspectRatio 4:3 应映射为 landscape_4_3", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generateImage({ ...defaultParams, aspectRatio: "4:3" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux/dev",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "landscape_4_3",
        }),
      })
    );
  });

  // 10. P0: aspectRatio 映射 1:1 -> square
  it("aspectRatio 1:1 应映射为 square", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generateImage({ ...defaultParams, aspectRatio: "1:1" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux/dev",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "square",
        }),
      })
    );
  });

  // 11. P1: aspectRatio 其他值 -> square (default)
  it("aspectRatio 其他值应默认映射为 square", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generateImage({ ...defaultParams, aspectRatio: "3:2" });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux/dev",
      expect.objectContaining({
        input: expect.objectContaining({
          image_size: "square",
        }),
      })
    );
  });

  // 12. P1: 使用正确模型 (fal-ai/flux/dev)
  it("应使用 fal-ai/flux/dev 模型", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generateImage(defaultParams);

    expect(mockSubscribe).toHaveBeenCalledWith(
      "fal-ai/flux/dev",
      expect.any(Object)
    );
  });

  // 13. P1: num_images 为 1
  it("num_images 应为 1", async () => {
    mockSubscribe.mockResolvedValueOnce({
      data: { images: [fakeFalImage] },
    });

    await generateImage(defaultParams);

    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({
          num_images: 1,
        }),
      })
    );
  });

  // 14. P2: 非 Error 异常
  it("非 Error 异常应包装为 ImageGenError 并使用 Unknown 消息", async () => {
    mockSubscribe.mockRejectedValueOnce("string error");

    try {
      await generateImage(defaultParams);
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

    await generateImage(defaultParams);

    expect(createFalClient).toHaveBeenCalledWith({
      credentials: "test-fal-key",
    });
  });
});
