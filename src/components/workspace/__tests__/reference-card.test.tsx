// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReferenceCard } from "@/components/workspace/reference-card";

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

  it("lets the reference image cover the available canvas", async () => {
    const onAspectRatioChange = vi.fn();

    render(
      <ReferenceCard
        {...defaultProps}
        state="analysis_ready"
        referenceImageUrl="https://cdn.example.com/reference.png"
        onAspectRatioChange={onAspectRatioChange}
      />,
    );

    expect(screen.getByTestId("reference-image-stage")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-hidden",
    );
    expect(screen.getByAltText("Reference")).toHaveClass(
      "object-cover",
      "object-center",
    );
    expect(screen.getByAltText("Reference")).not.toHaveClass("object-contain");
    Object.defineProperty(screen.getByAltText("Reference"), "naturalWidth", {
      configurable: true,
      value: 1600,
    });
    Object.defineProperty(screen.getByAltText("Reference"), "naturalHeight", {
      configurable: true,
      value: 1000,
    });
    fireEvent.load(screen.getByAltText("Reference"));
    await waitFor(() => expect(onAspectRatioChange).toHaveBeenCalledWith(1.6));
  });

  it("keeps analysis progress and detected content out of the reference canvas", () => {
    render(
      <ReferenceCard
        {...defaultProps}
        state="analyzing"
        referenceImageUrl="https://cdn.example.com/reference.png"
      />,
    );

    expect(screen.queryByLabelText("Reference analysis loading")).not.toBeInTheDocument();
    expect(screen.queryByText("Detected palette")).not.toBeInTheDocument();
    expect(screen.queryByText("View overlays")).not.toBeInTheDocument();
    expect(screen.queryByText("Analysis Match")).not.toBeInTheDocument();
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
