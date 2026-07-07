// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateCard } from "@/components/workspace/template-card";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

const sourceBackedMemory = {
  id: "template-1",
  name: "Editorial Soft Light Memory",
  variableCount: 2,
  sourceAssetId: "asset-1",
  sourceImageUrl: "https://cdn.example.com/reference.png",
  createdAt: "2026-06-01T00:00:00.000Z",
};

describe("TemplateCard", () => {
  it("renders a source-backed Style Memory card with tags and reuse intent", () => {
    render(<TemplateCard template={sourceBackedMemory} onUse={vi.fn()} />);

    const image = screen.getByRole("img", {
      name: "Reference image for Editorial Soft Light Memory",
    });
    expect(image).toHaveAttribute(
      "data-src",
      "https://cdn.example.com/reference.png",
    );
    expect(screen.getByRole("heading", { name: sourceBackedMemory.name })).toBeInTheDocument();
    expect(screen.getByText("2 variables")).toBeInTheDocument();
    expect(screen.getByText("Style tags")).toBeInTheDocument();
    expect(screen.getByText("Source-backed")).toBeInTheDocument();
    expect(screen.getByText("Variable structure")).toBeInTheDocument();
    expect(screen.getByText("Reuse intent")).toBeInTheDocument();
    expect(screen.getByText(/2 editable variables/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use memory/i })).toBeInTheDocument();
    expect(screen.queryByText("No source preview")).not.toBeInTheDocument();
  });

  it("falls back to the no source preview state without a source image", () => {
    render(
      <TemplateCard
        template={{
          id: "template-1",
          name: "Prompt Structure Only",
          variableCount: 0,
          sourceAssetId: null,
          sourceImageUrl: null,
          createdAt: "2026-06-01T00:00:00.000Z",
        }}
        onUse={vi.fn()}
      />,
    );

    expect(screen.getByText("No source preview")).toBeInTheDocument();
    expect(screen.getByText("0 variables")).toBeInTheDocument();
    expect(screen.getByText("Prompt-only")).toBeInTheDocument();
    expect(screen.getByText("Fixed prompt")).toBeInTheDocument();
    expect(screen.getByText(/reuse the prompt structure directly/i)).toBeInTheDocument();
  });

  it("keeps Use, Duplicate, and Delete actions wired to template ids", async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();

    render(
      <TemplateCard
        template={sourceBackedMemory}
        onUse={onUse}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: /use memory/i }));
    expect(onUse).toHaveBeenCalledWith("template-1");

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("button", { name: /^Duplicate$/i }));
    expect(onDuplicate).toHaveBeenCalledWith("template-1");

    await user.click(screen.getByRole("button", { name: /more actions/i }));
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(screen.getByRole("alertdialog", { name: /confirm delete/i })).toBeInTheDocument();

    await user.click(
      screen
        .getByRole("alertdialog", { name: /confirm delete/i })
        .querySelector("button:last-child") as HTMLButtonElement,
    );
    expect(onDelete).toHaveBeenCalledWith("template-1");
  });
});
