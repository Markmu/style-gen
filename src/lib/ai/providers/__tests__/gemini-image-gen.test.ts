import sharp from 'sharp';
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

async function pngHeaderBase64(width:number,height:number){return (await sharp({create:{width,height,channels:3,background:'#ff0000'}}).png().toBuffer()).toString('base64');}
async function jpegHeaderBase64(width:number,height:number){return (await sharp({create:{width,height,channels:3,background:'#ff0000'}}).jpeg().toBuffer()).toString('base64');}

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
      mockImageResponse(await pngHeaderBase64(1024, 768));

      const result = await generate();

      expect(result).toEqual({
        mode: "sync",
        imageBase64: await pngHeaderBase64(1024, 768),
        mimeType: "image/png",
        width: 1024,
        height: 768,
      });
    });

    it("使用 Nano Banana 2 Lite 模型 gemini-3.1-flash-lite-image", async () => {
      mockImageResponse(await pngHeaderBase64(512, 512));

      await generate();

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3.1-flash-lite-image",
        })
      );
    });

    it("携带 responseModalities 与 prompt", async () => {
      mockImageResponse(await pngHeaderBase64(512, 512));

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
        mockImageResponse(await pngHeaderBase64(512, 512));

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
      mockImageResponse(await jpegHeaderBase64(1344, 768), { mimeType: "image/jpeg" });

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

    it("无法解析的图片字节拒绝虚构尺寸", async () => {
      mockImageResponse(Buffer.from("not-an-image").toString("base64"), {mimeType:"image/jpeg"});
      await expect(generate()).rejects.toThrow("Invalid image metadata");
    });

    it("mimeType 缺省时回退 image/png", async () => {
      mockImageResponse(await pngHeaderBase64(256, 256), { mimeType: undefined });

      const result = await generate();

      expect(result).toEqual(
        expect.objectContaining({ mimeType: "image/png" })
      );
    });

    it("忽略 negativePrompt/quality/webhookUrl（与现有 Provider 行为一致）", async () => {
      mockImageResponse(await pngHeaderBase64(256, 256));

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
