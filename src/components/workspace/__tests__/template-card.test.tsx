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

describe("TemplateCard（plan-04 新卡片）", () => {
  it("已验证卡：徽标 + 代表结果主预览 + 参考图小图 + 真实规则摘要与变量数", () => {
    render(<TemplateCard template={memory()} onUse={vi.fn()} />);

    expect(screen.getByText("用户已验证")).toBeInTheDocument();
    expect(screen.queryByText("待验证")).not.toBeInTheDocument();

    const representative = screen.getByRole("img", {
      name: "Editorial Soft Daylight 的代表结果",
    });
    expect(representative).toHaveAttribute(
      "src",
      "https://cdn.example.com/results/representative.webp",
    );
    expect(
      screen.getByRole("img", { name: "Editorial Soft Daylight 的来源参考图" }),
    ).toHaveAttribute(
      "src",
      "https://cdn.example.com/references/source/original.webp",
    );
    expect(screen.getByText("参考图")).toBeInTheDocument();

    expect(screen.getByText(/低饱和暖灰基调/)).toBeInTheDocument();
    expect(screen.getByText(/柔和漫射光并保留细颗粒质感/)).toBeInTheDocument();
    expect(screen.getByText("6 个变量")).toBeInTheDocument();
    expect(screen.queryByText("尚未使用")).not.toBeInTheDocument();
  });

  it("已验证卡动作：查看详情链接指向详情页，使用按钮回调 id；无治理动作", async () => {
    const user = userEvent.setup();
    const onUse = vi.fn();
    render(<TemplateCard template={memory()} onUse={onUse} />);

    const viewDetail = screen.getByRole("link", { name: "查看详情" });
    expect(viewDetail).toHaveAttribute("href", "/workspace/templates/memory-1");

    await user.click(screen.getByRole("button", { name: "使用" }));
    expect(onUse).toHaveBeenCalledWith("memory-1");

    // 治理动作（更多操作/复制/删除）不在卡片上（PRD“详情为统一入口”）
    for (const label of [/more actions/i, /duplicate/i, /delete/i]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });

  it("待验证卡（有来源图）：来源图主预览，不出现代表结果图与成功语气", () => {
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

    expect(screen.getByText("待验证")).toBeInTheDocument();
    expect(screen.queryByText("用户已验证")).not.toBeInTheDocument();
    expect(screen.queryByText("参考图")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /代表结果/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Macro Paper Texture 的来源参考图" }),
    ).toBeInTheDocument();
    expect(screen.getByText("4 个变量")).toBeInTheDocument();
    expect(screen.getByText("尚未使用")).toBeInTheDocument();
  });

  it("待验证卡（无来源图）：“无预览”占位且不渲染任何图片", () => {
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

    expect(screen.getByText("待验证")).toBeInTheDocument();
    expect(screen.getByText("无预览")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("规则为空（旧资产）：摘要显示“规则待补充”", () => {
    render(
      <TemplateCard
        template={memory({ retainedRulesPreview: [] })}
        onUse={vi.fn()}
      />,
    );

    expect(screen.getByText("规则待补充")).toBeInTheDocument();
  });

  it("代表结果图加载失败：回退来源图并说明，徽标不变（架构 §8.2 L1）", () => {
    render(<TemplateCard template={memory()} onUse={vi.fn()} />);

    fireEvent.error(
      screen.getByRole("img", { name: "Editorial Soft Daylight 的代表结果" }),
    );

    expect(screen.getByText("代表结果图暂不可用")).toBeInTheDocument();
    expect(screen.getByText("用户已验证")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Editorial Soft Daylight 的来源参考图" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /代表结果/ }),
    ).not.toBeInTheDocument();
  });
});
