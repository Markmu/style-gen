import { describe, it, expect, vi, beforeEach } from "vitest";
import { STRUCTURER_SYSTEM_PROMPT } from "../../prompts";

const mockRun = vi.fn();

vi.mock("replicate", () => ({
  default: class {
    run = mockRun;
    constructor(_cfg: unknown) {}
  },
}));

import { ReplicateStructurerProvider } from "../replicate-structurer";

describe("ReplicateStructurerProvider", () => {
  let provider: ReplicateStructurerProvider;

  beforeEach(() => {
    process.env.REPLICATE_API_TOKEN = "test-token";
    mockRun.mockReset();
    provider = new ReplicateStructurerProvider();
  });

  it("缺少 REPLICATE_API_TOKEN 时抛出错误", () => {
    delete process.env.REPLICATE_API_TOKEN;
    expect(() => new ReplicateStructurerProvider()).toThrow(
      "REPLICATE_API_TOKEN environment variable is required for Replicate provider"
    );
  });

  it("通过 Replicate run 调用结构化模型", async () => {
    mockRun.mockResolvedValue(['{"ok":true}']);

    const result = await provider.structure({
      rawAnalysis: "raw analysis text",
      context: { taskId: "task-1", source: "analysis_webhook" },
    });

    expect(result).toBe('{"ok":true}');
    expect(mockRun).toHaveBeenCalledWith(
      "google/gemini-2.5-flash",
      {
        input: {
          prompt: "Here is the visual analysis to structure:\n\nraw analysis text",
          system_instruction: STRUCTURER_SYSTEM_PROMPT,
          temperature: 0,
          thinking_budget: 0,
        },
        wait: {
          mode: "block",
          timeout: 30,
        },
      }
    );
  });

  it("空输出时抛出错误", async () => {
    mockRun.mockResolvedValue([]);

    await expect(
      provider.structure({
        rawAnalysis: "raw analysis text",
      })
    ).rejects.toThrow("Replicate structurer returned empty response");
  });
});
