// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TemplateCard } from "@/components/workspace/template-card";
import type { StyleMemoryListItem } from "@/types/models";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    onError,
  }: {
    src: string;
    alt: string;
    onError?: React.ReactEventHandler<HTMLImageElement>;
  }) => <img src={src} alt={alt} onError={onError} />,
}));

function memory(
  overrides: Partial<StyleMemoryListItem> = {},
): StyleMemoryListItem {
  return {
    id: "memory-1",
    name: "Editorial Soft Daylight",
    verificationStatus: "user_verified",
    retainedRulesPreview: ["低饱和暖灰基调", "柔和漫射光并保留细颗粒质感"],
    variableCount: 6,
    sourceImageUrl: "https://cdn.example.com/references/source/original.webp",
    representativeImageUrl: "https://cdn.example.com/results/representative.webp",
    lastUsedAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("TemplateCard (plan-04 card)", () => {
  it("verified card: badge + representative main preview + reference thumbnail + real rules summary and variable count", () => {
    render(<TemplateCard template={memory()} onUse={vi.fn()} />);

    expect(screen.getByText("User verified")).toBeInTheDocument();
    expect(screen.queryByText("Pending verification")).not.toBeInTheDocument();

    const representative = screen.getByRole("img", {
      name: "Representative result for Editorial Soft Daylight",
    });
    expect(representative).toHaveAttribute(
      "src",
      "https://cdn.example.com/results/representative.webp",
    );
    expect(
      screen.getByRole("img", { name: "Source reference for Editorial Soft Daylight" }),
    ).toHaveAttribute(
      "src",
      "https://cdn.example.com/references/source/original.webp",
    );
    expect(screen.getByText("Reference")).toBeInTheDocument();

    expect(screen.getByText(/低饱和暖灰基调/)).toBeInTheDocument();
    expect(screen.getByText(/柔和漫射光并保留细颗粒质感/)).toBeInTheDocument();
    expect(screen.getByText("6 variables")).toBeInTheDocument();
    expect(screen.queryByText("Never used")).not.toBeInTheDocument();
  });

  it("verified card actions: View details link targets the detail page, Use button calls back with id; no governance actions", async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<TemplateCard template={memory()} onUse={onUse} />);

    const viewDetail = screen.getByRole("link", { name: "View details" });
    expect(viewDetail).toHaveAttribute("href", "/workspace/templates/memory-1");

    await user.click(screen.getByRole("button", { name: "Use" }));
    expect(onUse).toHaveBeenCalledWith("memory-1");

    // 治理动作（更多操作/复制/删除）不在卡片上（PRD“详情为统一入口”）
    for (const label of [/more actions/i, /duplicate/i, /delete/i]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });

  it("pending card with source image: source image main preview, no representative image and no success tone", () => {
    render(
      <TemplateCard
        template={memory({
          id: "memory-pending",
          name: "Macro Paper Texture",
          verificationStatus: "pending_verification",
          retainedRulesPreview: ["编辑式构图并保留大面积留白"],
          variableCount: 4,
          representativeImageUrl: null,
          lastUsedAt: null,
        })}
        onUse={vi.fn()}
      />,
    );

    expect(screen.getByText("Pending verification")).toBeInTheDocument();
    expect(screen.queryByText("User verified")).not.toBeInTheDocument();
    expect(screen.queryByText("Reference")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Representative result/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Source reference for Macro Paper Texture" }),
    ).toBeInTheDocument();
    expect(screen.getByText("4 variables")).toBeInTheDocument();
    expect(screen.getByText("Never used")).toBeInTheDocument();
  });

  it("pending card without source image: No preview placeholder and no image rendered", () => {
    render(
      <TemplateCard
        template={memory({
          verificationStatus: "pending_verification",
          sourceImageUrl: null,
          representativeImageUrl: null,
          lastUsedAt: null,
        })}
        onUse={vi.fn()}
      />,
    );

    expect(screen.getByText("Pending verification")).toBeInTheDocument();
    expect(screen.getByText("No preview")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("empty rules (legacy asset): summary shows No rules yet", () => {
    render(
      <TemplateCard
        template={memory({ retainedRulesPreview: [] })}
        onUse={vi.fn()}
      />,
    );

    expect(screen.getByText("No rules yet")).toBeInTheDocument();
  });

  it("representative image load failure: falls back to source image with explanation, badge unchanged (架构 §8.2 L1)", () => {
    render(<TemplateCard template={memory()} onUse={vi.fn()} />);

    fireEvent.error(
      screen.getByRole("img", { name: "Representative result for Editorial Soft Daylight" }),
    );

    expect(screen.getByText("Representative result unavailable")).toBeInTheDocument();
    expect(screen.getByText("User verified")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Source reference for Editorial Soft Daylight" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Representative result/ }),
    ).not.toBeInTheDocument();
  });
});
