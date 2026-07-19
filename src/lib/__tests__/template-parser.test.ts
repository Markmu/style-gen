import {
  extractVariables,
  mergeVariableValues,
  mergeTemplateVariables,
  replaceVariables,
  hasVariables,
  reconcileLinkedTextVariableEdit,
  restoreVariableMarkers,
} from "@/lib/template-parser";

describe("template-parser", () => {
  describe("extractVariables", () => {
    it("提取单个Variables", () => {
      const result = extractVariables("Hello {{name}}!");
      expect(result).toEqual([{ name: "name", defaultValue: "" }]);
    });

    it("提取多个Variables（按首次出现顺序）", () => {
      const result = extractVariables(
        "Hello {{name}}, welcome to {{place}}!"
      );
      expect(result).toEqual([
        { name: "name", defaultValue: "" },
        { name: "place", defaultValue: "" },
      ]);
    });

    it("去重：重复出现的Variables只返回一次", () => {
      const result = extractVariables(
        "Hi {{name}}, {{name}} is here"
      );
      expect(result).toEqual([{ name: "name", defaultValue: "" }]);
    });

    it("空字符串返回空数组", () => {
      const result = extractVariables("");
      expect(result).toEqual([]);
    });

    it("无Variables的文本返回空数组", () => {
      const result = extractVariables("No variables here");
      expect(result).toEqual([]);
    });

    it("支持下划线开头的Variable name", () => {
      const result = extractVariables("Value: {{_private}}");
      expect(result).toEqual([{ name: "_private", defaultValue: "" }]);
    });

    it("支持包含数字的Variable name（非首字符）", () => {
      const result = extractVariables("Item: {{item1}}, Count: {{count2}}");
      expect(result).toEqual([
        { name: "item1", defaultValue: "" },
        { name: "count2", defaultValue: "" },
      ]);
    });

    it("忽略非法格式的Variable name（数字开头）", () => {
      const result = extractVariables("Bad: {{123bad}}, Good: {{good}}");
      expect(result).toEqual([{ name: "good", defaultValue: "" }]);
    });

    it("支持中文、空格和横线Variable name", () => {
      const result = extractVariables(
        "{{主体 名称}} {{lighting-color}} {{ 中文变量 }}",
      );
      expect(result).toEqual([
        { name: "主体 名称", defaultValue: "" },
        { name: "lighting-color", defaultValue: "" },
        { name: "中文变量", defaultValue: "" },
      ]);
    });

    it("仍然忽略不符合起始字符规则的Variable name", () => {
      const result = extractVariables("Bad: {{123bad}}, Good: {{good_name}}");
      expect(result).toEqual([{ name: "good_name", defaultValue: "" }]);
    });

    it("处理大量Variable (>20)", () => {
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
    it("替换单个Variables", () => {
      const result = replaceVariables("Hello {{name}}!", { name: "Alice" });
      expect(result).toBe("Hello Alice!");
    });

    it("替换包含中文、空格和横线的Variables", () => {
      const result = replaceVariables(
        "{{主体 名称}} / {{lighting-color}} / {{ 中文变量 }}",
        {
          "主体 名称": "glass fox",
          "lighting-color": "soft blue",
          中文变量: "neon garden",
        },
      );

      expect(result).toBe("glass fox / soft blue / neon garden");
    });

    it("替换多个Variables", () => {
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

    it("长Variable name优先替换，避免短名误替换子串", () => {
      const result = replaceVariables(
        "{{long_name}} and {{name}}",
        { long_name: "LONG", name: "SHORT" }
      );
      expect(result).toBe("LONG and SHORT");
    });

    it("values 中缺少的Variables不替换（保留原标记）", () => {
      const result = replaceVariables("{{a}} and {{b}}", { a: "A" });
      expect(result).toBe("A and {{b}}");
    });

    it("空 values 对象返回原文", () => {
      const result = replaceVariables("Hello {{name}}!", {});
      expect(result).toBe("Hello {{name}}!");
    });

    it("无Variables文本原样返回", () => {
      const result = replaceVariables("Plain text", { name: "x" });
      expect(result).toBe("Plain text");
    });

    it("Variables值含特殊正则字符不被转义影响", () => {
      const result = replaceVariables("Price: {{price}}", {
        price: "$100.00",
      });
      expect(result).toBe("Price: $100.00");
    });

    it("Variables值含括号字符正常替换", () => {
      const result = replaceVariables("Expr: {{expr}}", {
        expr: "(a + b)",
      });
      expect(result).toBe("Expr: (a + b)");
    });
  });

  describe("mergeVariableValues", () => {
    it("按模板首次出现顺序保留已有Variables并新增空值", () => {
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

  describe("reconcileLinkedTextVariableEdit", () => {
    const variables = [
      { name: "subject", defaultValue: "glass fox" },
      { name: "lighting", defaultValue: "soft daylight" },
    ];
    const values = {
      subject: "glass fox",
      lighting: "soft daylight",
    };

    it("把 text mode 中的变量片段编辑同步回变量值", () => {
      const result = reconcileLinkedTextVariableEdit(
        "Create glass fox in soft daylight.",
        "Create crystal heron in soft daylight.",
        variables,
        values,
      );

      expect(result).toMatchObject({
        name: "subject",
        value: "crystal heron",
        promptText: "Create crystal heron in soft daylight.",
      });
    });

    it("同步更新同一变量的重复出现", () => {
      const result = reconcileLinkedTextVariableEdit(
        "glass fox beside glass fox",
        "crystal heron beside glass fox",
        variables,
        values,
      );

      expect(result).toMatchObject({
        name: "subject",
        value: "crystal heron",
        promptText: "crystal heron beside crystal heron",
      });
    });

    it("在变量暂时清空后保持连续输入的关联", () => {
      const cleared = reconcileLinkedTextVariableEdit(
        "Create glass fox.",
        "Create .",
        variables,
        values,
      );
      const firstCharacter = reconcileLinkedTextVariableEdit(
        cleared!.promptText,
        "Create c.",
        variables,
        { ...values, subject: cleared!.value },
        cleared!.linkState,
      );
      const secondCharacter = reconcileLinkedTextVariableEdit(
        firstCharacter!.promptText,
        "Create cr.",
        variables,
        { ...values, subject: firstCharacter!.value },
        firstCharacter!.linkState,
      );

      expect(secondCharacter).toMatchObject({
        name: "subject",
        value: "cr",
        promptText: "Create cr.",
      });
    });

    it("普通 prompt 文案编辑不修改变量", () => {
      expect(
        reconcileLinkedTextVariableEdit(
          "Create glass fox in soft daylight.",
          "Render glass fox in soft daylight.",
          variables,
          values,
        ),
      ).toBeNull();
    });
  });

  describe("restoreVariableMarkers", () => {
    it("把已填充的变量值恢复为模板标记", () => {
      expect(
        restoreVariableMarkers(
          "Render red ceramic stool in soft daylight.",
          [
            { name: "subject", defaultValue: "blue chair" },
            { name: "lighting", defaultValue: "soft daylight" },
          ],
          { subject: "red ceramic stool", lighting: "soft daylight" },
        ),
      ).toBe("Render {{subject}} in {{lighting}}.");
    });

    it("优先恢复更长的重叠变量值", () => {
      expect(
        restoreVariableMarkers(
          "A pale blue chair beside blue glass.",
          [
            { name: "subject", defaultValue: "pale blue chair" },
            { name: "color", defaultValue: "blue" },
          ],
          {},
        ),
      ).toBe("A {{subject}} beside {{color}} glass.");
    });
  });

  describe("mergeTemplateVariables", () => {
    it("按正文Variables顺序保留默认值和元信息", () => {
      const result = mergeTemplateVariables("{{scene}} with {{subject}}", [
        { name: "subject", defaultValue: "glass chair", label: "Subject", sourceField: "subject" },
        { name: "scene", defaultValue: "white studio", label: "Scene", sourceField: "scene" },
      ]);

      expect(result).toEqual([
        { name: "scene", defaultValue: "white studio", label: "Scene", sourceField: "scene" },
        { name: "subject", defaultValue: "glass chair", label: "Subject", sourceField: "subject" },
      ]);
    });

    it("丢弃正文外Variables、重复Variables和非法 sourceField", () => {
      const result = mergeTemplateVariables("{{subject}}", [
        { name: "subject", defaultValue: "first", label: "Subject", sourceField: "subject" },
        { name: "subject", defaultValue: "second", label: "Duplicate", sourceField: "scene" },
        { name: "outside", defaultValue: "ignored", label: "Outside", sourceField: "mood" },
        { name: "bad", defaultValue: "ignored", label: "Bad", sourceField: "not_valid" as never },
      ]);

      expect(result).toEqual([
        { name: "subject", defaultValue: "first", label: "Subject", sourceField: "subject" },
      ]);
    });

    it("未提供Variables时按旧行为生成Empty default", () => {
      const result = mergeTemplateVariables("{{subject}} and {{lighting}}");

      expect(result).toEqual([
        { name: "subject", defaultValue: "" },
        { name: "lighting", defaultValue: "" },
      ]);
    });
  });

  describe("hasVariables", () => {
    it("含Variables时返回 true", () => {
      expect(hasVariables("Hello {{name}}!")).toBe(true);
    });

    it("不含Variables时返回 false", () => {
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
