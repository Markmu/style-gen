import { describe, expect, it } from "vitest";
import type { EvidenceFacet } from "@/lib/evidence-facets";
import { derivePromptProvenanceSpans } from "@/lib/prompt-provenance";

const facets: EvidenceFacet[] = [
  {
    id: "lighting",
    label: "Lighting",
    summary: "Golden hour, warm backlight",
    tone: "lighting",
    confidenceLabel: "strong confidence",
    sourceField: "lighting",
    anchorIndex: 2,
  },
  {
    id: "composition",
    label: "Composition",
    summary: "Rule of thirds with horizon on lower third",
    tone: "composition",
    confidenceLabel: "strong confidence",
    sourceField: "composition",
    anchorIndex: 1,
  },
  {
    id: "texture",
    label: "Texture",
    summary: "powdered terrazzo grain with pearlescent micro scratches",
    tone: "texture",
    confidenceLabel: "medium confidence",
    sourceField: "texture",
    anchorIndex: 3,
  },
];

describe("derivePromptProvenanceSpans", () => {
  it("matches the longest available phrase before shorter keywords", () => {
    const [lighting] = derivePromptProvenanceSpans(
      "A bottle scene in golden hour light with warm shadows.",
      facets,
    );

    expect(lighting).toMatchObject({
      facetId: "lighting",
      matchedText: "golden hour",
      matchType: "exact",
    });
    expect(lighting.startIndex).toBeLessThan(lighting.endIndex ?? 0);
  });

  it("matches prompt text case-insensitively", () => {
    const [lighting] = derivePromptProvenanceSpans(
      "A scene with GOLDEN HOUR lighting.",
      facets,
    );

    expect(lighting).toMatchObject({
      matchedText: "GOLDEN HOUR",
      matchType: "exact",
    });
  });

  it("keeps original prompt coordinates across extra whitespace, newlines, and case changes", () => {
    const promptText =
      "Frame the subject with RULE   OF\nTHIRDS with horizon on lower third, leaving room for type.";
    const composition = derivePromptProvenanceSpans(promptText, facets).find(
      (span) => span.facetId === "composition",
    );
    const expectedMatchedText =
      "RULE   OF\nTHIRDS with horizon on lower third";
    const expectedStartIndex = promptText.indexOf(expectedMatchedText);

    expect(composition).toBeDefined();
    expect(composition).toMatchObject({
      matchedText: expectedMatchedText,
      startIndex: expectedStartIndex,
      endIndex: expectedStartIndex + expectedMatchedText.length,
      matchType: "exact",
    });
    expect(
      promptText.slice(composition?.startIndex ?? 0, composition?.endIndex ?? 0),
    ).toBe(expectedMatchedText);
  });

  it("falls back to facet_only when no prompt span is available", () => {
    const spans = derivePromptProvenanceSpans(
      "Minimal studio product render with neutral framing and crisp edge detail.",
      facets,
    );

    expect(spans.find((span) => span.facetId === "texture")).toMatchObject({
      matchedText: null,
      startIndex: null,
      endIndex: null,
      matchType: "facet_only",
    });
  });
});
