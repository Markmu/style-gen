// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingGenerateButton } from "@/components/workspace/floating-generate-button";

describe("FloatingGenerateButton", () => {
  it("renders disabled when generation is unavailable", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(
      <FloatingGenerateButton
        state="idle"
        canGenerate={false}
        disabledReason="Prompt is empty"
        onGenerate={onGenerate}
      />,
    );

    const button = screen.getByTestId("floating-generate-button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Prompt is empty");

    await user.click(button);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it("calls onGenerate when available", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();

    render(
      <FloatingGenerateButton
        state="analysis_ready"
        canGenerate
        onGenerate={onGenerate}
      />,
    );

    await user.click(screen.getByTestId("floating-generate-button"));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows loading state while generating", () => {
    render(
      <FloatingGenerateButton
        state="generating"
        canGenerate
        onGenerate={vi.fn()}
      />,
    );

    expect(screen.getByTestId("floating-generate-button")).toBeDisabled();
    expect(screen.getByText("Generating")).toBeInTheDocument();
  });
});
