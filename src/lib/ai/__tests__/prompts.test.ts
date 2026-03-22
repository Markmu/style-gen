import { VISION_SYSTEM_PROMPT, STRUCTURER_SYSTEM_PROMPT } from "../prompts";

describe("prompts", () => {
  describe("VISION_SYSTEM_PROMPT", () => {
    it("已导出且为非空字符串", () => {
      expect(typeof VISION_SYSTEM_PROMPT).toBe("string");
      expect(VISION_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });
  });

  describe("STRUCTURER_SYSTEM_PROMPT", () => {
    it("已导出且为非空字符串", () => {
      expect(typeof STRUCTURER_SYSTEM_PROMPT).toBe("string");
      expect(STRUCTURER_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    it("包含 JSON 结构说明关键字段", () => {
      expect(STRUCTURER_SYSTEM_PROMPT).toContain("imageSummary");
      expect(STRUCTURER_SYSTEM_PROMPT).toContain("promptText");
      expect(STRUCTURER_SYSTEM_PROMPT).toContain("negativePromptText");
    });
  });
});
