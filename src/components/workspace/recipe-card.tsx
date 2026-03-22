"use client";

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
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
      {children}
    </div>
  );
}

function FieldValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-sm text-gray-500">{label}:</span>
      <span className="text-sm text-gray-800">{value}</span>
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
          className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-base font-bold text-gray-900">视觉配方</h3>

      <RecipeSection title="主体与场景">
        <FieldValue label="主体" value={recipe.subject} />
        <FieldValue label="场景" value={recipe.scene} />
        <FieldValue label="概述" value={recipe.imageSummary} />
      </RecipeSection>

      <RecipeSection title="构图与镜头">
        <FieldValue label="构图" value={recipe.composition} />
        <FieldValue label="镜头语言" value={recipe.cameraLanguage} />
      </RecipeSection>

      <RecipeSection title="光照与色彩">
        <FieldValue label="光照" value={recipe.lighting} />
        <FieldValue label="色彩" value={recipe.color} />
      </RecipeSection>

      <RecipeSection title="质感与风格">
        <FieldValue label="质感" value={recipe.texture} />
        <FieldValue label="情绪" value={recipe.mood} />
        <div>
          <span className="text-sm text-gray-500">风格标签:</span>
          <div className="mt-1">
            <TagList tags={recipe.styleTags} />
          </div>
        </div>
      </RecipeSection>

      <RecipeSection title="关键词">
        <TagList tags={recipe.visualKeywords} />
      </RecipeSection>

      <RecipeSection title="保留 / 可替换">
        <div>
          <span className="text-xs font-medium text-green-600">保留:</span>
          <div className="mt-1">
            <TagList tags={recipe.mustKeep} />
          </div>
        </div>
        <div>
          <span className="text-xs font-medium text-orange-600">可替换:</span>
          <div className="mt-1">
            <TagList tags={recipe.replaceable} />
          </div>
        </div>
      </RecipeSection>
    </div>
  );
}
