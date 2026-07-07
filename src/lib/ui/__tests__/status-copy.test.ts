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
    expect(copy.description).toMatch(/reference/i);
    expect(copy.description).toMatch(/prompt/i);
    expect(copy.description).toMatch(/preserved/i);
    expect(copy.description).toMatch(/retry|back to edit/i);
  });

  it("describes queued work without losing editable context", () => {
    const copy = getStatusCopy("queued");

    expect(copy.description).toMatch(/60 seconds/i);
    expect(copy.description).toMatch(/reference/i);
    expect(copy.description).toMatch(/prompt/i);
    expect(copy.secondaryActionLabel).toBe("Back to Edit");
  });

  it("describes AI-first processing signals", () => {
    const copy = getStatusCopy("processing");

    expect(copy.description).toMatch(/AI/i);
    expect(copy.description).toMatch(/reference/i);
    expect(copy.description).toMatch(/color/i);
    expect(copy.description).toMatch(/composition/i);
    expect(copy.description).toMatch(/lighting/i);
    expect(copy.description).toMatch(/texture/i);
    expect(copy.description).toMatch(/mood/i);
  });

  it("covers auth and Style Memory no-result recovery", () => {
    const authCopy = getStatusCopy("authRequired");
    const noResultsCopy = getStatusCopy("noResults");
    const styleMemoryEmptyCopy = getStatusCopy("empty", {
      title: "No Style Memory Yet",
      description:
        "No saved style memory exists yet. The workspace remains available, and the next step is to save a useful prompt direction.",
      primaryActionLabel: "Start in Workspace",
      secondaryActionLabel: "",
    });

    expect(authCopy.description).toMatch(/Style Memory|history/i);
    expect(authCopy.description).toMatch(/workspace context/i);
    expect(noResultsCopy.description).toMatch(/Clear the search/i);
    expect(noResultsCopy.secondaryActionLabel).toBe("Back to Workspace");
    expect(styleMemoryEmptyCopy.status).toBe("empty");
    expect(styleMemoryEmptyCopy.title).toBe("No Style Memory Yet");
    expect(styleMemoryEmptyCopy.secondaryActionLabel).toBe("");
  });

  it("uses failedRecoverable overrides for service unavailable copy", () => {
    const copy = getStatusCopy("failedRecoverable", {
      title: "Generation Service Unavailable",
      description:
        "The render service is temporarily unavailable. Your reference and prompt stay editable, and you can save the direction as Style Memory or retry later.",
      primaryActionLabel: "Retry Later",
      secondaryActionLabel: "Back to Edit",
      tone: "warning",
    });

    expect(copy.status).toBe("failedRecoverable");
    expect(copy.tone).toBe("warning");
    expect(copy.description).toMatch(/service/i);
    expect(copy.description).toMatch(/reference and prompt/i);
    expect(copy.description).toMatch(/Style Memory/i);
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
