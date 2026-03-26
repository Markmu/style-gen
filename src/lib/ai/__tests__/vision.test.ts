import { analyzeImage, VisionError } from "../vision";

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

describe("vision", () => {
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

  describe("analyzeImage", () => {
    it("正常返回分析文本", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "A beautiful landscape with mountains",
      });

      const result = await analyzeImage("https://example.com/image.jpg");
      expect(result).toBe("A beautiful landscape with mountains");
    });

    it("传递指定的 mimeType", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "Analysis result",
      });

      await analyzeImage("https://example.com/image.png", "image/png");

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

    it("默认 mimeType 为 image/jpeg", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "Analysis result",
      });

      await analyzeImage("https://example.com/image.jpg");

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              parts: expect.arrayContaining([
                expect.objectContaining({
                  fileData: expect.objectContaining({
                    mimeType: "image/jpeg",
                  }),
                }),
              ]),
            }),
          ]),
        })
      );
    });

    it("使用正确模型 gemini-3-flash-preview", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "Analysis result",
      });

      await analyzeImage("https://example.com/image.jpg");

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3-flash-preview",
        })
      );
    });

    it("缺少 API Key 时抛出 VisionError", async () => {
      delete process.env.GEMINI_API_KEY;

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow(VisionError);

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow("GEMINI_API_KEY is not configured");
    });

    it("模型返回空响应时抛出 VisionError", async () => {
      mockGenerateContent.mockResolvedValue({
        text: "",
      });

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow(VisionError);

      mockGenerateContent.mockResolvedValue({
        text: "",
      });

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow("Vision model returned empty response");
    });

    it("超时 30 秒后抛出 VisionError", async () => {
      vi.useFakeTimers();

      mockGenerateContent.mockReturnValue(
        new Promise(() => {
          // never resolves
        })
      );

      const promise = analyzeImage("https://example.com/image.jpg");

      vi.advanceTimersByTime(30_000);

      await expect(promise).rejects.toThrow(VisionError);
      await expect(
        (async () => {
          mockGenerateContent.mockReturnValue(new Promise(() => {}));
          const p = analyzeImage("https://example.com/image.jpg");
          vi.advanceTimersByTime(30_000);
          return p;
        })()
      ).rejects.toThrow("Vision analysis timed out after 30s");
    });

    it("API 调用异常时抛出 VisionError 并包含原始消息", async () => {
      mockGenerateContent.mockRejectedValue(
        new Error("Network connection failed")
      );

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow(VisionError);

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow("Vision analysis failed: Network connection failed");
    });

    it("VisionError 透传不被二次包装", async () => {
      const originalError = new VisionError("Custom vision error");
      mockGenerateContent.mockRejectedValue(originalError);

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow(originalError);
    });

    it("非 Error 异常时抛出包含 Unknown 的 VisionError", async () => {
      mockGenerateContent.mockRejectedValue("string error");

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow(VisionError);

      await expect(
        analyzeImage("https://example.com/image.jpg")
      ).rejects.toThrow("Vision analysis failed: Unknown vision error");
    });
  });
});
