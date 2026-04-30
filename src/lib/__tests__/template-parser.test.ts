import {
  extractVariables,
  mergeVariableValues,
  replaceVariables,
  hasVariables,
} from "@/lib/template-parser";

describe("template-parser", () => {
  describe("extractVariables", () => {
    it("提取单个变量", () => {
      const result = extractVariables("Hello {{name}}!");
      expect(result).toEqual([{ name: "name", defaultValue: "" }]);
    });

    it("提取多个变量（按首次出现顺序）", () => {
      const result = extractVariables(
        "Hello {{name}}, welcome to {{place}}!"
      );
      expect(result).toEqual([
        { name: "name", defaultValue: "" },
        { name: "place", defaultValue: "" },
      ]);
    });

    it("去重：重复出现的变量只返回一次", () => {
      const result = extractVariables(
        "Hi {{name}}, {{name}} is here"
      );
      expect(result).toEqual([{ name: "name", defaultValue: "" }]);
    });

    it("空字符串返回空数组", () => {
      const result = extractVariables("");
      expect(result).toEqual([]);
    });

    it("无变量的文本返回空数组", () => {
      const result = extractVariables("No variables here");
      expect(result).toEqual([]);
    });

    it("支持下划线开头的变量名", () => {
      const result = extractVariables("Value: {{_private}}");
      expect(result).toEqual([{ name: "_private", defaultValue: "" }]);
    });

    it("支持包含数字的变量名（非首字符）", () => {
      const result = extractVariables("Item: {{item1}}, Count: {{count2}}");
      expect(result).toEqual([
        { name: "item1", defaultValue: "" },
        { name: "count2", defaultValue: "" },
      ]);
    });

    it("忽略非法格式的变量名（数字开头）", () => {
      const result = extractVariables("Bad: {{123bad}}, Good: {{good}}");
      expect(result).toEqual([{ name: "good", defaultValue: "" }]);
    });

    it("忽略非法格式的变量名（含特殊字符）", () => {
      const result = extractVariables("Bad: {{bad-name}}, Good: {{good_name}}");
      expect(result).toEqual([{ name: "good_name", defaultValue: "" }]);
    });

    it("处理大量变量 (>20)", () => {
      const parts: string[] = [];
      for (let i = 0; i < 25; i++) {
        parts.push(`{{var${i}}}`);
      }
      const content = parts.join(" ");
      const result = extractVariables(content);

      expect(result.length).toBe(25);
      for (let i = 0; i < 25; i++) {
        expect(result[i].name).toBe(`var${i}`);
        expect(result[i].defaultValue).toBe("");
      }
    });

    it("处理未闭合的标记不提取", () => {
      const result = extractVariables("Unclosed: {{name, Good: {{ok}}");
      expect(result).toEqual([{ name: "ok", defaultValue: "" }]);
    });
  });

  describe("replaceVariables", () => {
    it("替换单个变量", () => {
      const result = replaceVariables("Hello {{name}}!", { name: "Alice" });
      expect(result).toBe("Hello Alice!");
    });

    it("替换多个变量", () => {
      const result = replaceVariables(
        "{{greeting}} {{name}}, welcome to {{place}}!",
        { greeting: "Hi", name: "Bob", place: "Tokyo" }
      );
      expect(result).toBe("Hi Bob, welcome to Tokyo!");
    });

    it("替换所有同名出现", () => {
      const result = replaceVariables(
        "Hi {{name}}, {{name}} is here",
        { name: "Alice" }
      );
      expect(result).toBe("Hi Alice, Alice is here");
    });

    it("长变量名优先替换，避免短名误替换子串", () => {
      const result = replaceVariables(
        "{{long_name}} and {{name}}",
        { long_name: "LONG", name: "SHORT" }
      );
      expect(result).toBe("LONG and SHORT");
    });

    it("values 中缺少的变量不替换（保留原标记）", () => {
      const result = replaceVariables("{{a}} and {{b}}", { a: "A" });
      expect(result).toBe("A and {{b}}");
    });

    it("空 values 对象返回原文", () => {
      const result = replaceVariables("Hello {{name}}!", {});
      expect(result).toBe("Hello {{name}}!");
    });

    it("无变量文本原样返回", () => {
      const result = replaceVariables("Plain text", { name: "x" });
      expect(result).toBe("Plain text");
    });

    it("变量值含特殊正则字符不被转义影响", () => {
      const result = replaceVariables("Price: {{price}}", {
        price: "$100.00",
      });
      expect(result).toBe("Price: $100.00");
    });

    it("变量值含括号字符正常替换", () => {
      const result = replaceVariables("Expr: {{expr}}", {
        expr: "(a + b)",
      });
      expect(result).toBe("Expr: (a + b)");
    });
  });

  describe("mergeVariableValues", () => {
    it("按模板首次出现顺序保留已有变量并新增空值", () => {
      const result = mergeVariableValues("{{subject}} with {{lighting}} and {{subject}}", {
        subject: "glass chair",
        removed: "unused",
      });

      expect(result).toEqual({
        subject: "glass chair",
        lighting: "",
      });
    });
  });

  describe("hasVariables", () => {
    it("含变量时返回 true", () => {
      expect(hasVariables("Hello {{name}}!")).toBe(true);
    });

    it("不含变量时返回 false", () => {
      expect(hasVariables("No variables")).toBe(false);
    });

    it("空字符串返回 false", () => {
      expect(hasVariables("")).toBe(false);
    });

    it("仅花括号但格式不对返回 false", () => {
      expect(hasVariables("{{123}}")).toBe(false);
    });
  });
});
