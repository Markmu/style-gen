"use client";

import type { VisualRecipe } from "@/types/models";
import type { WorkspaceState } from "@/hooks/use-workspace-state";
import { extractRecipeCategories } from "@/lib/recipe-categories";

interface RecipeCardProps {
  state: WorkspaceState;
  recipe: VisualRecipe | null;
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

export function RecipeCard({ state, recipe }: RecipeCardProps) {
  const isAnalyzing = state === "analyzing";
  const categories = extractRecipeCategories(recipe);

  return (
    <article
      id="visual-recipe"
      data-testid="recipe-card"
      className="surface-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl p-4"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            Visual Recipe
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Style structure
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isAnalyzing ? (
          <RecipeSkeleton />
        ) : recipe ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--surface-low)] p-4">
              <p className="label-tech text-[var(--text-muted)]">Core summary</p>
              <p className="mt-3 text-sm font-medium leading-6 text-[var(--text-primary)]">
                {recipe.subject}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {recipe.imageSummary}
              </p>
              <div className="mt-3">
                <TagList tags={recipe.styleTags} />
              </div>
            </div>

            <div className="space-y-2.5">
              {categories.map((category) => (
                <section
                  key={category.category}
                  className="rounded-lg bg-[var(--surface-low)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="icon mt-0.5 text-[19px]"
                      style={{ color: category.iconColor }}
                      aria-hidden="true"
                    >
                      {category.iconName}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {category.label}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                        {category.description}
                      </p>
                    </div>
                  </div>
                </section>
              ))}
            </div>

            <div>
              <button
                type="button"
                className="btn-secondary w-full rounded-lg px-4 py-2 text-sm"
              >
                Copy recipe to prompt
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col justify-center rounded-lg bg-[var(--surface-low)] p-6">
            <span className="icon mb-4 text-[var(--accent-primary)]" aria-hidden="true">
              data_object
            </span>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Upload a reference image to generate a visual recipe.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function RecipeSkeleton() {
  return (
    <div className="space-y-4 rounded-lg bg-[var(--surface-low)] p-4" aria-label="Visual Recipe loading">
      <div className="h-3 w-28 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-full bg-[var(--surface-bright)]" />
        <div className="h-3 w-10/12 animate-pulse rounded-full bg-[var(--surface-bright)]" />
        <div className="h-3 w-7/12 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      </div>
      <div className="flex gap-2 pt-2">
        <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--surface-bright)]" />
        <div className="h-6 w-24 animate-pulse rounded-full bg-[var(--surface-bright)]" />
      </div>
    </div>
  );
}
