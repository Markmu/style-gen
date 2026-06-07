// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
  });
});
