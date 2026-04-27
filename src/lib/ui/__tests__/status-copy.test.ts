import {
  getStatusCopy,
  PRODUCT_STATUS_COPY,
  PRODUCT_STATUSES,
  type StatusTone,
} from "@/lib/ui/status-copy";

const expectedStatuses = [
  "empty",
  "loading",
  "queued",
  "processing",
  "success",
  "failedRecoverable",
  "restored",
  "authRequired",
  "noResults",
] as const;

describe("status-copy", () => {
  it("defines copy for every ProductStatus", () => {
    expect(PRODUCT_STATUSES).toEqual(expectedStatuses);

    for (const status of expectedStatuses) {
      const copy = PRODUCT_STATUS_COPY[status];

      expect(copy.status).toBe(status);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.description.length).toBeGreaterThan(0);
    }
  });

  it("uses only valid tones", () => {
    const validTones: StatusTone[] = [
      "neutral",
      "accent",
      "success",
      "warning",
      "danger",
    ];

    for (const copy of Object.values(PRODUCT_STATUS_COPY)) {
      expect(validTones).toContain(copy.tone);
    }
  });

  it("keeps failedRecoverable actionable", () => {
    const copy = getStatusCopy("failedRecoverable");

    expect(copy.primaryActionLabel).toBeTruthy();
    expect(copy.secondaryActionLabel).toBeTruthy();
    expect(copy.description).not.toMatch(/^失败$/);
  });

  it("allows local overrides without changing the status", () => {
    const copy = getStatusCopy("processing", {
      title: "正在生成",
      primaryActionLabel: "查看队列",
      tone: "accent",
    });

    expect(copy.status).toBe("processing");
    expect(copy.title).toBe("正在生成");
    expect(copy.primaryActionLabel).toBe("查看队列");
    expect(copy.tone).toBe("accent");
  });
});
