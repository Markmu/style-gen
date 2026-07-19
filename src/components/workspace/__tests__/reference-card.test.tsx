// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReferenceCard } from "@/components/workspace/reference-card";
import { deriveEvidenceFacets } from "@/lib/evidence-facets";
import type { VisualRecipe } from "@/types/models";

const mockRecipe: VisualRecipe = {
  imageSummary: "A serene landscape",
  subject: "Mountain range",
  scene: "Alpine meadow",
  composition: "Rule of thirds",
  cameraLanguage: "Wide angle",
  lighting: "Golden hour",
  color: "Warm palette",
  texture: "Soft clouds",
  styleTags: ["landscape", "nature"],
  mood: "Peaceful",
  visualKeywords: ["mountain", "meadow"],
  mustKeep: ["golden light"],
  replaceable: ["specific flowers"],
};

const defaultProps = {
  state: "idle" as const,
  referenceImageUrl: null,
  isUploading: false,
  uploadProgress: 0,
  onFileSelected: vi.fn(),
  onReplace: vi.fn(),
};

describe("ReferenceCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the empty upload panel fill the reference content area", () => {
    render(<ReferenceCard {...defaultProps} />);

    expect(screen.getByText("Click or drag to upload a reference image")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reference help")).not.toBeInTheDocument();
    expect(screen.getByTestId("reference-upload-panel")).toHaveClass("min-h-0", "flex-1");
    expect(screen.getByTestId("reference-empty-state").children).toHaveLength(1);
    expect(
      screen.getByTestId("reference-upload-panel"),
    ).toContainElement(screen.getByTestId("reference-upload-dropzone"));
    expect(screen.getByText(/AI will read the reference as evidence/i)).toBeInTheDocument();
    expect(screen.getByText("composition")).toBeInTheDocument();
  });

  it("renders evidence anchors and selected state on the reference image", async () => {
    const facets = deriveEvidenceFacets(mockRecipe);
    const onAspectRatioChange = vi.fn();

    render(
      <ReferenceCard
        {...defaultProps}
        state="analysis_ready"
        referenceImageUrl="https://cdn.example.com/reference.png"
        recipe={mockRecipe}
        facets={facets}
        selectedFacetId="lighting"
        onAspectRatioChange={onAspectRatioChange}
      />,
    );

    expect(screen.getByTestId("reference-image-stage")).toHaveClass(
      "h-[clamp(18rem,48dvh,32rem)]",
      "min-h-[18rem]",
      "max-h-[32rem]",
      "max-w-full",
      "overflow-hidden",
    );
    expect(screen.getByTestId("reference-image-stage")).toHaveStyle({
      aspectRatio: "0.8",
    });
    expect(screen.getByAltText("Reference")).toHaveClass(
      "object-contain",
      "object-center",
    );
    expect(screen.getByAltText("Reference")).not.toHaveClass("object-cover");
    Object.defineProperty(screen.getByAltText("Reference"), "naturalWidth", {
      configurable: true,
      value: 1600,
    });
    Object.defineProperty(screen.getByAltText("Reference"), "naturalHeight", {
      configurable: true,
      value: 1000,
    });
    fireEvent.load(screen.getByAltText("Reference"));
    expect(screen.getByTestId("reference-image-stage")).toHaveStyle({
      aspectRatio: "1.6",
    });
    await waitFor(() =>
      expect(onAspectRatioChange).toHaveBeenCalledWith(1.6),
    );
    expect(screen.getByTestId("reference-anchor-color")).toHaveAttribute("data-selected", "false");
    expect(screen.getByTestId("reference-anchor-lighting")).toHaveAttribute("data-selected", "true");
  });

  it("keeps recovery actions visible when analysis fails after upload", () => {
    render(
      <ReferenceCard
        {...defaultProps}
        state="idle"
        referenceImageUrl="https://cdn.example.com/reference.png"
        error={{ message: "Provider unavailable", retryable: true }}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/Reference context preserved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry analysis/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Replace/i })).toBeInTheDocument();
  });
});
