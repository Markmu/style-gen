import {
  RULES_PENDING_LABEL,
  NEVER_USED_LABEL,
  deriveStyleMemoryCardViewModel,
  formatStyleMemoryLastUsed,
} from "@/lib/style-memory-view-model";
import type { StyleMemoryListItem } from "@/types/models";

const NOW = Date.parse("2026-08-26T12:00:00.000Z");

function memory(
  overrides: Partial<StyleMemoryListItem> = {},
): StyleMemoryListItem {
  return {
    id: "memory-1",
    name: "Editorial Soft Daylight",
    verificationStatus: "user_verified",
    retainedRulesPreview: ["低饱和暖灰基调", "柔和漫射光并保留细颗粒质感"],
    variableCount: 6,
    sourceImageUrl: "https://cdn.example.com/references/source/original.webp",
    representativeImageUrl: "https://cdn.example.com/results/representative.webp",
    lastUsedAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveStyleMemoryCardViewModel", () => {
  it("已验证卡：徽标文字 + 代表结果主预览 + 参考图小图 + 真实规则摘要与变量数", () => {
    const viewModel = deriveStyleMemoryCardViewModel(memory());

    expect(viewModel.statusBadge).toEqual({
      label: "用户已验证",
      isVerified: true,
    });
    expect(viewModel.rulesSummary).toBe(
      "低饱和暖灰基调 · 柔和漫射光并保留细颗粒质感",
    );
    expect(viewModel.variableLabel).toBe("6 个变量");
    expect(viewModel.preview).toEqual({
      kind: "representative",
      mainImageUrl: "https://cdn.example.com/results/representative.webp",
      mainAlt: "Editorial Soft Daylight 的代表结果",
      referenceImageUrl: "https://cdn.example.com/references/source/original.webp",
    });
    expect(viewModel.actions.viewDetailLabel).toBe("查看详情");
    expect(viewModel.actions.useLabel).toBe("使用");
    expect(viewModel.actions.viewDetailHref).toBe("/workspace/templates/memory-1");
  });

  it("待验证卡（有来源图）：徽标为“待验证”，来源图为主预览且无代表结果图", () => {
    const viewModel = deriveStyleMemoryCardViewModel(
      memory({
        verificationStatus: "pending_verification",
        representativeImageUrl: null,
        lastUsedAt: null,
      }),
    );

    expect(viewModel.statusBadge).toEqual({ label: "待验证", isVerified: false });
    expect(viewModel.preview.kind).toBe("source");
    expect(viewModel.preview.mainImageUrl).toBe(
      "https://cdn.example.com/references/source/original.webp",
    );
    expect(viewModel.preview.referenceImageUrl).toBeNull();
    expect(viewModel.lastUsedLabel).toBe(NEVER_USED_LABEL);
  });

  it("待验证卡（无来源图）：预览为“无预览”，不虚构任何图片", () => {
    const viewModel = deriveStyleMemoryCardViewModel(
      memory({
        verificationStatus: "pending_verification",
        representativeImageUrl: null,
        sourceImageUrl: null,
        lastUsedAt: null,
      }),
    );

    expect(viewModel.preview).toEqual({
      kind: "none",
      mainImageUrl: null,
      mainAlt: expect.any(String),
      referenceImageUrl: null,
    });
  });

  it("已验证但代表结果缺失：回退来源图作主预览（旧资产降级，状态徽标不变）", () => {
    const viewModel = deriveStyleMemoryCardViewModel(
      memory({ representativeImageUrl: null }),
    );

    expect(viewModel.statusBadge.isVerified).toBe(true);
    expect(viewModel.preview.kind).toBe("source");
    expect(viewModel.preview.mainImageUrl).toBe(
      "https://cdn.example.com/references/source/original.webp",
    );
    expect(viewModel.preview.referenceImageUrl).toBeNull();
  });

  it("规则数组为空（旧资产）：摘要显示“规则待补充”，不从名称派生标签", () => {
    const viewModel = deriveStyleMemoryCardViewModel(
      memory({ name: "Editorial Glass Macro", retainedRulesPreview: [] }),
    );

    expect(viewModel.rulesSummary).toBe(RULES_PENDING_LABEL);
    // 视图模型不再产出名称派生标签（NAME_TAG_RULES / deriveNameTags 已删除）
    expect(viewModel).not.toHaveProperty("styleTags");
    expect(viewModel).not.toHaveProperty("reuseIntent");
  });

  it("lastUsedAt 存在时显示相对使用时间而非“尚未使用”", () => {
    const viewModel = deriveStyleMemoryCardViewModel(memory());

    expect(viewModel.lastUsedLabel).not.toBe(NEVER_USED_LABEL);
    expect(viewModel.lastUsedLabel).toMatch(/天前使用$/);
  });
});

describe("formatStyleMemoryLastUsed", () => {
  it("非法时间按“尚未使用”兜底", () => {
    expect(formatStyleMemoryLastUsed("not-a-date", NOW)).toBe(NEVER_USED_LABEL);
  });

  it("1 小时内为“刚刚使用”（含时钟 skew 的未来时间）", () => {
    expect(
      formatStyleMemoryLastUsed("2026-08-26T11:30:00.000Z", NOW),
    ).toBe("刚刚使用");
    expect(
      formatStyleMemoryLastUsed("2026-08-26T13:00:00.000Z", NOW),
    ).toBe("刚刚使用");
  });

  it("24 小时内按小时；30 天内按天；更久按月/年", () => {
    expect(formatStyleMemoryLastUsed("2026-08-26T06:00:00.000Z", NOW)).toBe(
      "6 小时前使用",
    );
    expect(formatStyleMemoryLastUsed("2026-08-20T10:00:00.000Z", NOW)).toBe(
      "6 天前使用",
    );
    expect(formatStyleMemoryLastUsed("2026-05-20T10:00:00.000Z", NOW)).toBe(
      "3 个月前使用",
    );
    expect(formatStyleMemoryLastUsed("2024-08-26T10:00:00.000Z", NOW)).toBe(
      "2 年前使用",
    );
  });
});
