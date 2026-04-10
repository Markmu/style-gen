import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeminiStructurerProvider } from "../gemini-structurer";

const mockGenerateContent = vi.fn();

describe("GeminiStructurerProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: "test-api-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  function createProvider() {
    const provider = new GeminiStructurerProvider();
    (provider as unknown as {
      client: { models: { generateContent: typeof mockGenerateContent } };
    }).client = {
      models: {
        generateContent: mockGenerateContent,
      },
    };
    return provider;
  }

  it("缺少 GEMINI_API_KEY 时抛出错误", () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiStructurerProvider()).toThrow(
      "GEMINI_API_KEY is not configured"
    );
  });

  it("使用 JSON mode 调用 Gemini 并返回文本", async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{"recipe":{"imageSummary":"ok","subject":"ok","scene":"ok","composition":"ok","cameraLanguage":"ok","lighting":"ok","color":"ok","texture":"ok","styleTags":["ok"],"mood":"ok","visualKeywords":["ok"],"mustKeep":["ok"],"replaceable":["ok"]},"promptText":"prompt","negativePromptText":"neg"}',
    });
    const provider = createProvider();

    const result = await provider.structure({
      rawAnalysis: "raw analysis text",
      context: { taskId: "task-1", source: "analysis_webhook" },
    });

    expect(result).toContain('"promptText":"prompt"');
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
        config: expect.objectContaining({
          responseMimeType: "application/json",
        }),
      })
    );
  });

  it("超时 30 秒后抛出错误", async () => {
    vi.useFakeTimers();
    mockGenerateContent.mockReturnValue(new Promise(() => {}));
    const provider = createProvider();

    const promise = provider.structure({
      rawAnalysis: "raw analysis text",
    });
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(30_000);

    await expect(promise).rejects.toThrow(
      "Structure analysis timed out after 30s"
    );
  });
});
