"use client";

import type { VisualRecipe } from "@/types/models";

/** 风格标签 — 仅此组件内部消费 */
interface StyleTag {
  label: string;
  sourceField: string;
}

/**
 * 从 VisualRecipe 提取风格标签（架构 §7.2 extractStyleTags）。
 * - 优先从 recipe.styleTags 取前 5 个
 * - 不足 3 个时从核心字段（subject / mood / color）补充
 */
function extractStyleTags(recipe: VisualRecipe): StyleTag[] {
  const tags: StyleTag[] = [];

  // 优先使用 styleTags
  if (recipe.styleTags?.length) {
    for (const tag of recipe.styleTags.slice(0, 5)) {
      tags.push({ label: tag, sourceField: "styleTags" });
    }
  }

  // 不足 3 个时从核心字段补充
  if (tags.length < 3) {
    const fallbacks: { field: keyof VisualRecipe; sourceField: string }[] = [
      { field: "subject", sourceField: "subject" },
      { field: "mood", sourceField: "mood" },
      { field: "color", sourceField: "color" },
    ];

    for (const { field, sourceField } of fallbacks) {
      if (tags.length >= 5) break;
      const value = recipe[field];
      if (typeof value === "string" && value.trim()) {
        // 避免重复
        const label = value.trim();
        if (!tags.some((t) => t.label === label)) {
          tags.push({ label, sourceField });
        }
      }
    }
  }

  return tags;
}

interface StyleTagBarProps {
  recipe: VisualRecipe;
}

export function StyleTagBar({ recipe }: StyleTagBarProps) {
  const tags = extractStyleTags(recipe);

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={`${tag.sourceField}-${tag.label}`}
          className="rounded-full bg-[var(--accent-secondary-soft)] px-2.5 py-0.5 text-xs text-[var(--accent-secondary-ink)]"
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
}
