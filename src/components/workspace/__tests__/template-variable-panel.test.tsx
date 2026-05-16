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
    expect(screen.getByLabelText("变量 subject")).toHaveValue("glass fox");
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

    expect(screen.getByText("本次没有识别到足够稳定的可替换变量")).toBeInTheDocument();
    expect(screen.getByText("Not enough stable variable candidates.")).toBeInTheDocument();
  });
});
