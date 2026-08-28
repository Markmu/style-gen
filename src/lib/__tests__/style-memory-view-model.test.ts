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
  it("verified card: badge text + representative main preview + reference thumbnail + real rules summary and variable count", () => {
    const viewModel = deriveStyleMemoryCardViewModel(memory());

    expect(viewModel.statusBadge).toEqual({
      label: "User verified",
      isVerified: true,
    });
    expect(viewModel.rulesSummary).toBe(
      "低饱和暖灰基调 · 柔和漫射光并保留细颗粒质感",
    );
    expect(viewModel.variableLabel).toBe("6 variables");
    expect(viewModel.preview).toEqual({
      kind: "representative",
      mainImageUrl: "https://cdn.example.com/results/representative.webp",
      mainAlt: "Representative result for Editorial Soft Daylight",
      referenceImageUrl: "https://cdn.example.com/references/source/original.webp",
    });
    expect(viewModel.actions.viewDetailLabel).toBe("View details");
    expect(viewModel.actions.useLabel).toBe("Use");
    expect(viewModel.actions.viewDetailHref).toBe("/workspace/templates/memory-1");
  });

  it("pending card with source image: badge is Pending verification, source image is the main preview with no representative image", () => {
    const viewModel = deriveStyleMemoryCardViewModel(
      memory({
        verificationStatus: "pending_verification",
        representativeImageUrl: null,
        lastUsedAt: null,
      }),
    );

    expect(viewModel.statusBadge).toEqual({
      label: "Pending verification",
      isVerified: false,
    });
    expect(viewModel.preview.kind).toBe("source");
    expect(viewModel.preview.mainImageUrl).toBe(
      "https://cdn.example.com/references/source/original.webp",
    );
    expect(viewModel.preview.referenceImageUrl).toBeNull();
    expect(viewModel.lastUsedLabel).toBe(NEVER_USED_LABEL);
  });

  it("pending card without source image: preview is No preview, no image is fabricated", () => {
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

  it("verified but representative missing: falls back to source image as main preview (legacy asset degradation, badge unchanged)", () => {
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

  it("empty rules array (legacy asset): summary shows No rules yet, no name-derived tags", () => {
    const viewModel = deriveStyleMemoryCardViewModel(
      memory({ name: "Editorial Glass Macro", retainedRulesPreview: [] }),
    );

    expect(viewModel.rulesSummary).toBe(RULES_PENDING_LABEL);
    // 视图模型不再产出名称派生标签（NAME_TAG_RULES / deriveNameTags 已删除）
    expect(viewModel).not.toHaveProperty("styleTags");
    expect(viewModel).not.toHaveProperty("reuseIntent");
  });

  it("shows relative last-used time instead of Never used when lastUsedAt exists", () => {
    const viewModel = deriveStyleMemoryCardViewModel(memory());

    expect(viewModel.lastUsedLabel).not.toBe(NEVER_USED_LABEL);
    expect(viewModel.lastUsedLabel).toMatch(/days ago$/);
  });
});

describe("formatStyleMemoryLastUsed", () => {
  it("falls back to Never used for invalid times", () => {
    expect(formatStyleMemoryLastUsed("not-a-date", NOW)).toBe(NEVER_USED_LABEL);
  });

  it("within one hour is Used just now (including future clock skew)", () => {
    expect(
      formatStyleMemoryLastUsed("2026-08-26T11:30:00.000Z", NOW),
    ).toBe("Used just now");
    expect(
      formatStyleMemoryLastUsed("2026-08-26T13:00:00.000Z", NOW),
    ).toBe("Used just now");
  });

  it("within 24 hours by hour; within 30 days by day; beyond by month/year", () => {
    expect(formatStyleMemoryLastUsed("2026-08-26T06:00:00.000Z", NOW)).toBe(
      "Used 6 hours ago",
    );
    expect(formatStyleMemoryLastUsed("2026-08-20T10:00:00.000Z", NOW)).toBe(
      "Used 6 days ago",
    );
    expect(formatStyleMemoryLastUsed("2026-05-20T10:00:00.000Z", NOW)).toBe(
      "Used 3 months ago",
    );
    expect(formatStyleMemoryLastUsed("2024-08-26T10:00:00.000Z", NOW)).toBe(
      "Used 2 years ago",
    );
  });
});
