import { GeminiImageGenProvider } from "../gemini-image-gen";
import { ImageGenError } from "../types";

// Mock @google/genai
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(function () {
      return {
        models: {
          generateContent: mockGenerateContent,
        },
      };
    }),
  };
});

import { GoogleGenAI } from "@google/genai";
const MockedGoogleGenAI = vi.mocked(GoogleGenAI);

/** 构造带 IHDR 宽高的 PNG 头部 base64（Provider 只解析前 24 字节） */
function pngHeaderBase64(width: number, height: number): string {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header.toString("base64");
}

/** 构造带 SOF0 宽高的 JPEG 头部 base64（Provider 只解析头部标记） */
function jpegHeaderBase64(width: number, height: number): string {
  const header = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x08, // 段长度
    0x08, // 精度
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, // 分量数
  ]);
  return header.toString("base64");
}

function mockImageResponse(
  data: string,
  options: { mimeType?: string; withTextPart?: boolean } = {}
) {
  const inlinePart = {
    inlineData: {
      mimeType: options.mimeType ?? "image/png",
      data,
    },
  };
  const parts =
    options.withTextPart === false
      ? [inlinePart]
      : [{ text: "interim thinking" }, inlinePart];
  mockGenerateContent.mockResolvedValue({
    candidates: [{ content: { parts } }],
  });
}

function generate(overrides: Partial<Parameters<GeminiImageGenProvider["generate"]>[0]> = {}) {
  const provider = new GeminiImageGenProvider();
  return provider.generate({
    prompt: "A minimalist poster in the reference style",
    negativePrompt: "blurry",
    aspectRatio: "1:1",
    quality: "high",
    ...overrides,
  });
}

describe("GeminiImageGenProvider", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    MockedGoogleGenAI.mockImplementation(function () {
      return {
        models: {
          generateContent: mockGenerateContent,
        },
      } as unknown as InstanceType<typeof GoogleGenAI>;
    });
    process.env = { ...ORIGINAL_ENV, GEMINI_API_KEY: "test-api-key" };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.useRealTimers();
  });

  describe("generate", () => {
    it("返回同步 base64 变体并解析 PNG 宽高", async () => {
      mockImageResponse(pngHeaderBase64(1024, 768));

      const result = await generate();

      expect(result).toEqual({
        mode: "sync",
        imageBase64: pngHeaderBase64(1024, 768),
        mimeType: "image/png",
        width: 1024,
        height: 768,
      });
    });

    it("使用 Nano Banana 2 Lite 模型 gemini-3.1-flash-lite-image", async () => {
      mockImageResponse(pngHeaderBase64(512, 512));

      await generate();

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3.1-flash-lite-image",
        })
      );
    });

    it("携带 responseModalities 与 prompt", async () => {
      mockImageResponse(pngHeaderBase64(512, 512));

      await generate({ prompt: "A warm sunset over the mountains" });

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            {
              role: "user",
              parts: [{ text: "A warm sunset over the mountains" }],
            },
          ],
          config: expect.objectContaining({
            responseModalities: ["TEXT", "IMAGE"],
          }),
        })
      );
    });

    it.each(["1:1", "16:9", "4:3"])(
      "aspectRatio %s 透传到 imageConfig",
      async (aspectRatio) => {
        mockImageResponse(pngHeaderBase64(512, 512));

        await generate({ aspectRatio });

        expect(mockGenerateContent).toHaveBeenCalledWith(
          expect.objectContaining({
            config: expect.objectContaining({
              imageConfig: { aspectRatio },
            }),
          })
        );
      }
    );

    it("JPEG 图片（模型实际返回格式）从 SOF 解析宽高", async () => {
      mockImageResponse(jpegHeaderBase64(1344, 768), { mimeType: "image/jpeg" });

      const result = await generate({ aspectRatio: "16:9" });

      expect(result).toEqual(
        expect.objectContaining({
          mode: "sync",
          mimeType: "image/jpeg",
          width: 1344,
          height: 768,
        })
      );
    });

    it("无法解析的图片字节回退 1024x1024 宽高", async () => {
      mockImageResponse(Buffer.from("not-an-image").toString("base64"), {
        mimeType: "image/jpeg",
      });

      const result = await generate();

      expect(result).toEqual(
        expect.objectContaining({
          mode: "sync",
          mimeType: "image/jpeg",
          width: 1024,
          height: 1024,
        })
      );
    });

    it("mimeType 缺省时回退 image/png", async () => {
      mockImageResponse(pngHeaderBase64(256, 256), { mimeType: undefined });

      const result = await generate();

      expect(result).toEqual(
        expect.objectContaining({ mimeType: "image/png" })
      );
    });

    it("忽略 negativePrompt/quality/webhookUrl（与现有 Provider 行为一致）", async () => {
      mockImageResponse(pngHeaderBase64(256, 256));

      await generate({ webhookUrl: "https://example.com/webhook" });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.not.objectContaining({ webhookUrl: expect.anything() })
      );
      const input = mockGenerateContent.mock.calls[0][0];
      expect(JSON.stringify(input)).not.toContain("blurry");
      expect(JSON.stringify(input)).not.toContain("high");
    });

    it("缺少 GEMINI_API_KEY 时抛出 ImageGenError", async () => {
      delete process.env.GEMINI_API_KEY;

      await expect(generate()).rejects.toThrow(ImageGenError);
      await expect(generate()).rejects.toThrow("GEMINI_API_KEY is not configured");
    });

    it("parts 无 inlineData 时抛出 ImageGenError", async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: "text only response" }] } }],
      });

      await expect(generate()).rejects.toThrow(ImageGenError);
      await expect(generate()).rejects.toThrow("Model returned no images");
    });

    it("candidates 缺失时抛出 ImageGenError", async () => {
      mockGenerateContent.mockResolvedValue({ candidates: [] });

      await expect(generate()).rejects.toThrow(ImageGenError);
      await expect(generate()).rejects.toThrow("Model returned no images");
    });

    it("超时 120s 后抛出 ImageGenError", async () => {
      vi.useFakeTimers();

      try {
        mockGenerateContent.mockReturnValue(
          new Promise(() => {
            // never resolves
          })
        );

        const promise = generate();
        promise.catch(() => {});

        await vi.advanceTimersByTimeAsync(120_000);

        await expect(promise).rejects.toThrow(ImageGenError);
        await expect(promise).rejects.toThrow(
          "Image generation timed out after 120s"
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("API 调用异常时抛出 ImageGenError 并包含原始消息", async () => {
      mockGenerateContent.mockRejectedValue(new Error("Network failed"));

      await expect(generate()).rejects.toThrow(ImageGenError);
      await expect(generate()).rejects.toThrow(
        "Image generation failed: Network failed"
      );
    });

    it("ImageGenError 透传不被二次包装", async () => {
      const originalError = new ImageGenError("custom error from model");
      mockGenerateContent.mockRejectedValue(originalError);

      await expect(generate()).rejects.toThrow(originalError);
    });

    it("非 Error 异常时抛出包含 Unknown 的 ImageGenError", async () => {
      mockGenerateContent.mockRejectedValue("string error");

      await expect(generate()).rejects.toThrow(ImageGenError);
      await expect(generate()).rejects.toThrow(
        "Image generation failed: Unknown image generation error"
      );
    });
  });

  it("name 为 gemini", () => {
    expect(new GeminiImageGenProvider().name).toBe("gemini");
  });
});
