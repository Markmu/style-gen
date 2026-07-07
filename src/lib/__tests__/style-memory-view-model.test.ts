import { deriveStyleMemoryCardViewModel } from "@/lib/style-memory-view-model";
import type { TemplateListItem } from "@/hooks/use-template-search";

function template(overrides: Partial<TemplateListItem> = {}): TemplateListItem {
  return {
    id: "memory-1",
    name: "Editorial Soft Light Memory",
    variableCount: 2,
    sourceAssetId: "asset-1",
    sourceImageUrl: "https://cdn.example.com/source.png",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveStyleMemoryCardViewModel", () => {
  it("derives source image, variable count, style tags, and reuse intent", () => {
    const viewModel = deriveStyleMemoryCardViewModel(template());

    expect(viewModel).toMatchObject({
      id: "memory-1",
      name: "Editorial Soft Light Memory",
      sourceImageUrl: "https://cdn.example.com/source.png",
      sourceAlt: "Reference image for Editorial Soft Light Memory",
      variableCount: 2,
      variableLabel: "2 variables",
    });
    expect(viewModel.styleTags).toEqual(
      expect.arrayContaining([
        "Source-backed",
        "Variable structure",
        "Editorial",
        "Soft light",
      ]),
    );
    expect(viewModel.reuseIntent).toContain("2 editable variables");
    expect(viewModel.actions.useLabel).toBe("Use memory");
  });

  it("explains text-only memories with no source preview", () => {
    const viewModel = deriveStyleMemoryCardViewModel(
      template({
        name: "Prompt Structure Only",
        variableCount: 0,
        sourceAssetId: null,
        sourceImageUrl: null,
      }),
    );

    expect(viewModel.sourceImageUrl).toBeNull();
    expect(viewModel.variableLabel).toBe("0 variables");
    expect(viewModel.styleTags).toEqual(
      expect.arrayContaining(["Prompt-only", "Fixed prompt"]),
    );
    expect(viewModel.reuseIntent).toBe(
      "Prompt-only memory; reuse the prompt structure directly.",
    );
  });

  it("uses singular variable copy", () => {
    const viewModel = deriveStyleMemoryCardViewModel(
      template({ variableCount: 1 }),
    );

    expect(viewModel.variableLabel).toBe("1 variable");
    expect(viewModel.reuseIntent).toContain("editable variable");
  });
});
