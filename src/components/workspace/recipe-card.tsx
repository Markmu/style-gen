"use client";

import { useState } from "react";
import type { VisualRecipe } from "@/types/models";

interface RecipeCardProps {
  recipe: VisualRecipe;
}

interface RecipeSectionProps {
  title: string;
  children: React.ReactNode;
}

function RecipeSection({ title, children }: RecipeSectionProps) {
  return (
    <div className="space-y-2">
      <h4 className="label-tech text-[var(--text-secondary)]">{title}</h4>
      {children}
    </div>
  );
}

function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 label-tech text-[var(--text-secondary)]">{label}</span>
      <span className="text-sm text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-block rounded-full bg-[var(--surface-bright)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="space-y-4 rounded-xl bg-[var(--surface-mid)] p-5 ring-1 ring-[var(--border)]">
      {/* 标题 */}
      <h3 className="text-base font-bold text-[var(--text-primary)]">视觉配方</h3>

      {/* 默认展示区（折叠状态） */}
      <div className="space-y-3">
        <RecipeSection title="核心摘要">
          <FieldValue label="主体" value={recipe.subject} />
          <FieldValue label="概述" value={recipe.imageSummary} />
        </RecipeSection>

        <div>
          <span className="label-tech text-[var(--text-secondary)]">风格标签:</span>
          <div className="mt-1">
            <TagList tags={recipe.styleTags} />
          </div>
        </div>
      </div>

      {/* 展开切换按钮 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--surface-bright)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)]"
        type="button"
      >
        <span>{isExpanded ? "收起详细信息" : "展开详细信息"}</span>
        <svg
          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 展开详细区（带动画） */}
      <div
        className={`grid overflow-hidden transition-all duration-300 ease-out ${
          isExpanded ? "grid-rows-\[1fr\]" : "grid-rows-\[0fr\]"
        }`}
      >
        <div className="min-h-0">
          <div className="space-y-4 pt-4">
          <RecipeSection title="构图与镜头">
            <FieldValue label="场景" value={recipe.scene} />
            <FieldValue label="构图" value={recipe.composition} />
            <FieldValue label="镜头语言" value={recipe.cameraLanguage} />
            <p className="text-xs text-[var(--text-secondary)]/60 mt-1">
              镜头语言：描述拍摄角度、距离、运动方式等摄影技法
            </p>
          </RecipeSection>

          <RecipeSection title="光照与色彩">
            <FieldValue label="光照" value={recipe.lighting} />
            <FieldValue label="色彩" value={recipe.color} />
          </RecipeSection>

          <RecipeSection title="质感与风格">
            <FieldValue label="质感" value={recipe.texture} />
            <FieldValue label="情绪" value={recipe.mood} />
          </RecipeSection>

          <RecipeSection title="关键词">
            <TagList tags={recipe.visualKeywords} />
          </RecipeSection>

          <RecipeSection title="保留 / 可替换">
            <div>
              <span className="label-tech text-emerald-400">保留:</span>
              <div className="mt-1">
                <TagList tags={recipe.mustKeep} />
              </div>
            </div>
            <div>
              <span className="label-tech text-amber-400">可替换:</span>
              <div className="mt-1">
                <TagList tags={recipe.replaceable} />
              </div>
            </div>
          </RecipeSection>
          </div>
        </div>
      </div>
    </div>
  );
}
