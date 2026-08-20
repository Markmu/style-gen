import { GeminiVisionProvider, VisionError } from "../gemini-vision";

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

function analyze(imageUrl: string, mimeType: string = "image/jpeg") {
  const provider = new GeminiVisionProvider();
  return provider.analyze({ imageUrl, mimeType });
}

describe("GeminiVisionProvider", () => {
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

  describe("analyze", () => {
    it("正常返回同步分析文本", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "A beautiful landscape with mountains",
      });

      const result = await analyze("https://example.com/image.jpg");

      expect(result).toEqual({
        mode: "sync",
        result: "A beautiful landscape with mountains",
      });
    });

    it("传递指定的 mimeType", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "Analysis result",
      });

      await analyze("https://example.com/image.png", "image/png");

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({
                  fileData: expect.objectContaining({
                    mimeType: "image/png",
                  }),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("忽略 webhookUrl 参数（Gemini 为同步调用）", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "Analysis result",
      });

      const provider = new GeminiVisionProvider();
      const result = await provider.analyze({
        imageUrl: "https://example.com/image.jpg",
        mimeType: "image/jpeg",
        webhookUrl: "https://example.com/webhook",
      });

      expect(result).toEqual({
        mode: "sync",
        result: "Analysis result",
      });
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.not.objectContaining({ webhookUrl: expect.anything() })
      );
    });

    it("使用正确模型 gemini-2.5-flash", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "Analysis result",
      });

      await analyze("https://example.com/image.jpg");

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-2.5-flash",
        })
      );
    });

    it("缺少 API Key 时抛出 VisionError", async () => {
      delete process.env.GEMINI_API_KEY;

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow(VisionError);

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow("GEMINI_API_KEY is not configured");
    });

    it("模型返回空响应时抛出 VisionError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "",
      });

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow(VisionError);

      mockGenerateContent.mockResolvedValue({
        text: "",
      });

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow("Vision model returned empty response");
    });

    it("超时 60s后抛出 VisionError", async () => {
      vi.useFakeTimers();

      try {
        mockGenerateContent.mockReturnValue(
          new Promise(() => {
            // never resolves
          })
        );

        const promise = analyze("https://example.com/image.jpg");

        // 添加空 catch 防止 unhandled rejection
        promise.catch(() => {});

        await vi.advanceTimersByTimeAsync(60_000);

        await expect(promise).rejects.toThrow(VisionError);
        await expect(promise).rejects.toThrow(
          "Vision analysis timed out after 60s"
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("API 调用异常时抛出 VisionError 并包含原始消息", async () => {
      mockGenerateContent.mockRejectedValue(
        new Error("Network connection failed")
      );

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow(VisionError);

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow("Vision analysis failed: Network connection failed");
    });

    it("VisionError 透传不被二次包装", async () => {
      const originalError = new VisionError("Custom vision error");
      mockGenerateContent.mockRejectedValue(originalError);

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow(originalError);
    });

    it("非 Error 异常时抛出包含 Unknown 的 VisionError", async () => {
      mockGenerateContent.mockRejectedValue("string error");

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow(VisionError);

      await expect(
        analyze("https://example.com/image.jpg")
      ).rejects.toThrow("Vision analysis failed: Unknown vision error");
    });
  });
});
