import {
  ITERATION_DEGRADED_COPY,
  ITERATION_DEGRADED_COPY_KEYS,
  ITERATION_STATUS_LABELS,
  buildIterationSettingsSummary,
  formatIterationDate,
  getIterationDegradedCopy,
  toIterationListItemModel,
} from "@/lib/iterations/view-model";
import type { IterationListItem } from "@/types/models";

const baseItem: IterationListItem = {
  id: "iter-001",
  status: "completed",
  promptSummary: "Neon cityscape at dusk",
  resultFileUrl: "https://cdn.example.com/generated/iter-001/result.webp",
  params: { aspectRatio: "16:9", quality: "hd" },
  createdAt: "2024-03-03T09:00:00.000Z",
};

describe("iteration status labels", () => {
  it("maps every display status to its label", () => {
    expect(ITERATION_STATUS_LABELS.processing).toBe("Processing");
    expect(ITERATION_STATUS_LABELS.completed).toBe("Completed");
    expect(ITERATION_STATUS_LABELS.failed).toBe("Failed");
  });
});

describe("buildIterationSettingsSummary", () => {
  it("joins aspect ratio and quality with a single separator", () => {
    expect(
      buildIterationSettingsSummary({ aspectRatio: "16:9", quality: "hd" }),
    ).toBe("16:9 · hd");
  });

  it("keeps arbitrary parameter values as provided", () => {
    expect(
      buildIterationSettingsSummary({ aspectRatio: "4:5", quality: "standard" }),
    ).toBe("4:5 · standard");
  });
});

describe("formatIterationDate", () => {
  it("formats an ISO date deterministically in UTC", () => {
    expect(formatIterationDate("2024-03-03T09:00:00.000Z")).toBe(
      "Mar 3, 2024, 09:00 UTC",
    );
  });

  it("returns the raw value when the date cannot be parsed", () => {
    expect(formatIterationDate("not-a-date")).toBe("not-a-date");
  });
});

describe("toIterationListItemModel", () => {
  it("maps a completed item with a real result preview", () => {
    const model = toIterationListItemModel(baseItem);

    expect(model.id).toBe("iter-001");
    expect(model.status).toBe("completed");
    expect(model.statusLabel).toBe("Completed");
    expect(model.promptSummary).toBe("Neon cityscape at dusk");
    expect(model.settingsSummary).toBe("16:9 · hd");
    expect(model.createdAtLabel).toBe("Mar 3, 2024, 09:00 UTC");
    expect(model.hasResultPreview).toBe(true);
    expect(model.resultFileUrl).toBe(baseItem.resultFileUrl);
  });

  it("marks completed items without a result URL as having no preview", () => {
    const model = toIterationListItemModel({
      ...baseItem,
      resultFileUrl: null,
    });

    expect(model.hasResultPreview).toBe(false);
    expect(model.resultFileUrl).toBeNull();
  });

  it("never promises a preview for processing or failed items", () => {
    expect(
      toIterationListItemModel({ ...baseItem, status: "processing" })
        .hasResultPreview,
    ).toBe(false);
    expect(
      toIterationListItemModel({ ...baseItem, status: "failed" }).hasResultPreview,
    ).toBe(false);
  });
});

describe("iteration degraded copy", () => {
  it("exposes unique keys for every degraded context", () => {
    const keys = Object.values(ITERATION_DEGRADED_COPY_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(ITERATION_DEGRADED_COPY).sort()).toEqual(
      [...keys].sort(),
    );
  });

  it("keeps the three-part structure (what / preserved / next) for each key", () => {
    for (const copy of Object.values(ITERATION_DEGRADED_COPY)) {
      expect(copy.what.trim().length).toBeGreaterThan(0);
      expect(copy.preserved.trim().length).toBeGreaterThan(0);
      expect(copy.next.trim().length).toBeGreaterThan(0);
      expect(copy.what.endsWith(".")).toBe(true);
      expect(copy.preserved.endsWith(".")).toBe(true);
    }
  });

  it("falls back to the preview copy for unknown keys", () => {
    expect(getIterationDegradedCopy("iteration.unknown")).toBe(
      ITERATION_DEGRADED_COPY[ITERATION_DEGRADED_COPY_KEYS.resultPreviewUnavailable],
    );
  });
});
