// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { TemplateVariablePanel } from "@/components/workspace/template-variable-panel";

describe("TemplateVariablePanel", () => {
  it("renders label, sourceField, and default value metadata", () => {
    render(
      <TemplateVariablePanel
        variables={[
          { name: "subject", label: "Subject", defaultValue: "glass fox", sourceField: "subject" },
        ]}
        values={{ subject: "glass fox" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Subject")).toBeInTheDocument();
    expect(screen.getByText("subject")).toBeInTheDocument();
    expect(screen.getByLabelText("Variable subject")).toHaveValue("glass fox");
  });

  it("shows fallback reason when no trusted variables are available", () => {
    render(
      <TemplateVariablePanel
        variables={[]}
        values={{}}
        onChange={vi.fn()}
        templateStatus="fallback"
        templateReason="Not enough stable variable candidates."
      />,
    );

    expect(screen.getByText("No stable replaceable variables were detected this time.")).toBeInTheDocument();
    expect(screen.getByText("Not enough stable variable candidates.")).toBeInTheDocument();
  });

  it("renders negative_prompt as a multiline variable", () => {
    render(
      <TemplateVariablePanel
        variables={[
          { name: "negative_prompt", label: "Negative Prompt", defaultValue: "blurry" },
        ]}
        values={{ negative_prompt: "blurry" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Variable negative_prompt").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("Variable negative_prompt")).toHaveValue("blurry");
    expect(screen.getByLabelText("Variable negative_prompt")).toHaveAttribute("rows", "2");
  });
});
