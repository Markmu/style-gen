// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Info } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";

describe("AppIcon", () => {
  it("applies the shared Lucide outline treatment", () => {
    const { container } = render(<AppIcon icon={Info} size={24} />);
    const icon = container.querySelector("svg");

    expect(icon).toHaveClass("lucide-info");
    expect(icon).toHaveAttribute("width", "24");
    expect(icon).toHaveAttribute("height", "24");
    expect(icon).toHaveAttribute("stroke-width", "1.75");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("exposes an accessible name only when supplied", () => {
    render(<AppIcon icon={Info} label="More information" />);

    expect(screen.getByRole("img", { name: "More information" })).toBeInTheDocument();
  });
});
