import {
  computeRestoreGuard,
  RESTORE_GUARD_REASONS,
  type WorkspaceSnapshot,
} from "@/lib/iterations/restore-guard";
import type { IterationDetail } from "@/types/models";

/** 最小可用 IterationDetail（守卫仅消费 id / 提示 / 排除项 / 参数） */
function buildTarget(overrides: Partial<IterationDetail> = {}): IterationDetail {
  return {
    id: "iter-target",
    analysisTaskId: "analysis-target",
    status: "completed",
    promptSnapshot: "Neon cityscape at dusk with amber towers",
    negativePromptSnapshot: "watermark, distorted glass",
    params: { aspectRatio: "16:9", quality: "hd" },
    modelName: "black-forest-2.5",
    resultFileUrl: "https://cdn.example.com/generated/iter-target/result.webp",
    errorMessage: null,
    recipe: null,
    recipeSource: "missing",
    variables: [],
    variablesSource: "missing",
    sourceImageUrl: "https://cdn.example.com/references/iter-target/original.png",
    sourceAssetId: "asset-target",
    sourceTemplateId: null,
    sourceTemplateName: null,
    savedTemplate: null,
    analysisTemplateVariables: [],
    createdAt: "2024-03-03T09:00:00.000Z",
    updatedAt: "2024-03-03T09:00:30.000Z",
    ...overrides,
  };
}

function buildSnapshot(
  overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot {
  return {
    currentIterationId: null,
    promptText: "Lavender haze editorial study",
    negativePromptText: "harsh shadows",
    params: { aspectRatio: "1:1", quality: "standard" },
    ...overrides,
  };
}

describe("computeRestoreGuard — 三豁免", () => {
  it("豁免①：current 为空（工作台无内容）→ direct", () => {
    const result = computeRestoreGuard(null, buildTarget());

    expect(result).toEqual({
      action: "direct",
      reason: RESTORE_GUARD_REASONS.emptyWorkspace,
    });
  });

  it("豁免②：currentIterationId === target.id → direct（即使内容已漂移）", () => {
    const current = buildSnapshot({
      currentIterationId: "iter-target",
      promptText: "已经改成完全不同的未完成编辑",
      negativePromptText: "别的排除项",
      params: { aspectRatio: "9:16", quality: "standard" },
    });

    const result = computeRestoreGuard(current, buildTarget());

    expect(result).toEqual({
      action: "direct",
      reason: RESTORE_GUARD_REASONS.sameIteration,
    });
  });

  it("豁免③：提示 / 排除项 / 两参数逐字段相等 → direct", () => {
    const current = buildSnapshot({
      currentIterationId: "iter-other",
      promptText: "Neon cityscape at dusk with amber towers",
      negativePromptText: "watermark, distorted glass",
      params: { aspectRatio: "16:9", quality: "hd" },
    });

    const result = computeRestoreGuard(current, buildTarget());

    expect(result).toEqual({
      action: "direct",
      reason: RESTORE_GUARD_REASONS.identicalContent,
    });
  });
});

describe("computeRestoreGuard — confirm 分支", () => {
  it("存在不同的未完成内容（提示不同）→ confirm", () => {
    const result = computeRestoreGuard(buildSnapshot(), buildTarget());

    expect(result).toEqual({
      action: "confirm",
      reason: RESTORE_GUARD_REASONS.differentContent,
    });
  });

  it("提示一致但排除项不同 → confirm", () => {
    const current = buildSnapshot({
      promptText: "Neon cityscape at dusk with amber towers",
      negativePromptText: "不同的排除项",
      params: { aspectRatio: "16:9", quality: "hd" },
    });

    expect(computeRestoreGuard(current, buildTarget()).action).toBe("confirm");
  });

  it("提示与排除项一致但 aspectRatio 不同 → confirm", () => {
    const current = buildSnapshot({
      promptText: "Neon cityscape at dusk with amber towers",
      negativePromptText: "watermark, distorted glass",
      params: { aspectRatio: "1:1", quality: "hd" },
    });

    expect(computeRestoreGuard(current, buildTarget()).action).toBe("confirm");
  });

  it("提示与排除项一致但 quality 不同 → confirm", () => {
    const current = buildSnapshot({
      promptText: "Neon cityscape at dusk with amber towers",
      negativePromptText: "watermark, distorted glass",
      params: { aspectRatio: "16:9", quality: "standard" },
    });

    expect(computeRestoreGuard(current, buildTarget()).action).toBe("confirm");
  });

  it("提示与排除项一致但当前参数缺失（无法证明一致）→ 保守侧 confirm", () => {
    const current = buildSnapshot({
      promptText: "Neon cityscape at dusk with amber towers",
      negativePromptText: "watermark, distorted glass",
      params: null,
    });

    expect(computeRestoreGuard(current, buildTarget()).action).toBe("confirm");
  });
});

describe("computeRestoreGuard — 纯函数契约", () => {
  it("不修改输入对象且同输入同输出", () => {
    const current = buildSnapshot();
    const target = buildTarget();
    const currentFrozen = JSON.stringify(current);
    const targetFrozen = JSON.stringify(target);

    const first = computeRestoreGuard(current, target);
    const second = computeRestoreGuard(current, target);

    expect(first).toEqual(second);
    expect(JSON.stringify(current)).toBe(currentFrozen);
    expect(JSON.stringify(target)).toBe(targetFrozen);
  });
});
