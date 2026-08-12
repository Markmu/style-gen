"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search, X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { StatePresenter } from "@/components/ui/state-presenter";
import { TemplateCard } from "@/components/workspace/template-card";
import { useTemplateSearch } from "@/hooks/use-template-search";
import type { TemplateVariable } from "@/types/models";

const WORKSPACE_STORAGE_KEY = "style-gen-workspace-state";
const WORKSPACE_STORAGE_VERSION = 4;

interface TemplateDetailForWorkspace {
  content?: string;
  variables?: TemplateVariable[];
  sourceAssetId?: string | null;
  sourceImageUrl?: string | null;
}

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="style-memory-card flex min-h-[25rem] flex-col"
    >
      <div className="style-memory-source aspect-[16/10] w-full animate-pulse motion-reduce:animate-none" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
          <div className="h-3 w-2/5 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
        </div>
        <div className="flex gap-2">
          <div className="h-6 w-24 animate-pulse rounded-full bg-[var(--surface-low)] motion-reduce:animate-none" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--surface-low)] motion-reduce:animate-none" />
        </div>
        <div className="mt-auto flex items-end justify-between gap-4">
          <div className="h-10 w-3/5 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
          <div className="h-9 w-24 animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

async function readActionError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function primeWorkspaceSnapshotFromTemplate(id: string) {
  if (typeof window === "undefined") return;

  try {
    const res = await fetch(`/api/templates/${id}`);
    if (!res.ok) return;

    const template = (await res.json()) as TemplateDetailForWorkspace;
    if (!template.sourceAssetId || !template.sourceImageUrl || !template.content) {
      return;
    }

    window.sessionStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: WORKSPACE_STORAGE_VERSION,
        assetId: template.sourceAssetId,
        referenceImageUrl: template.sourceImageUrl,
        analysisTaskId: null,
        recipe: null,
        promptText: template.content,
        negativePromptText: "",
        analysisTemplateContent: template.content,
        analysisTemplateVariables: template.variables ?? [],
        analysisTemplateStatus:
          template.variables && template.variables.length > 0 ? "ready" : null,
        analysisTemplateReason: null,
        generationTaskId: null,
        v2PromptState: null,
      }),
    );
  } catch {
    // The workspace still falls back to its existing templateId load path.
  }
}

export default function StyleMemoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    templates,
    isLoading,
    isError,
    error,
    isAuthRequired,
    search,
    setSearch,
    isSearching,
  } = useTemplateSearch();

  const hasSearched = search.trim().length > 0;
  const memories = useMemo(() => templates ?? [], [templates]);
  const visibleMemories = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return memories;

    return memories.filter((template) =>
      [
        template.name,
        template.sourceAssetId ?? "",
        template.sourceImageUrl ?? "",
        `${template.variableCount} variables`,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [memories, search]);
  const hasMemories = visibleMemories.length > 0;
  const isFetchFailure = !isLoading && isError;
  const showAuthRequired = isFetchFailure && isAuthRequired;
  const showFailedRecoverable = isFetchFailure && !isAuthRequired;
  const showEmpty =
    !isLoading && !isFetchFailure && !hasSearched && visibleMemories.length === 0;
  const showNoResults =
    !isLoading && !isFetchFailure && hasSearched && visibleMemories.length === 0;
  const showGrid = !isLoading && !isFetchFailure && hasMemories;
  const resultLabel = `${visibleMemories.length} ${
    visibleMemories.length === 1 ? "memory" : "memories"
  }`;

  const goToWorkspace = useCallback(() => {
    router.push("/workspace");
  }, [router]);

  const handleUseTemplate = useCallback(
    async (id: string) => {
      setActionError(null);
      await primeWorkspaceSnapshotFromTemplate(id);
      router.push(`/workspace?templateId=${id}`);
    },
    [router],
  );

  const handleRetry = useCallback(async () => {
    setActionError(null);
    await queryClient.invalidateQueries({ queryKey: ["templates"] });
    router.refresh();
  }, [queryClient, router]);

  const handleLogin = useCallback(() => {
    router.push("/api/auth/signin?callbackUrl=/workspace/templates");
  }, [router]);

  const handleDuplicate = useCallback(
    async (id: string) => {
      setActionError(null);
      const res = await fetch(`/api/templates/${id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        setActionError(
          await readActionError(res, "Duplicate failed. Your memories remain available."),
        );
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      router.refresh();
    },
    [queryClient, router],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setActionError(null);
      const res = await fetch(`/api/templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setActionError(
          await readActionError(res, "Delete failed. Your memories remain available."),
        );
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      router.refresh();
    },
    [queryClient, router],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="style-memory-page"
    >
      <header className="shrink-0 px-3 pb-4 pt-5 sm:px-4 lg:px-5 lg:pb-5 lg:pt-7">
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)] lg:text-[2.25rem]">
              Style Memory
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Keep visual directions you trust, then reuse them with a new subject or scene.
            </p>
          </div>
          {showGrid && (
            <button
              type="button"
              onClick={goToWorkspace}
              className="btn-secondary inline-flex w-fit items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium"
            >
              <AppIcon icon={ArrowLeft} size={16} />
              Open Workspace
            </button>
          )}
        </div>
      </header>

      {!isFetchFailure && (
        <section
          aria-label="Style Memory search"
          className="shrink-0 px-3 pb-4 sm:px-4 lg:px-5"
        >
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="style-memory-search group relative flex min-h-11 min-w-0 flex-1 items-center rounded-lg px-3 sm:max-w-xl">
              <span className="sr-only">Search Style Memory</span>
              <AppIcon
                icon={Search}
                size={18}
                className="shrink-0 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-primary)]"
              />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Search by name, style, or source"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
              {isSearching && (
                <span
                  className="shrink-0 text-xs text-[var(--text-muted)]"
                  aria-live="polite"
                >
                  Searching
                </span>
              )}
              {hasSearched && !isSearching && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="interactive-lift flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label="Clear Search"
                >
                  <AppIcon icon={X} size={15} />
                </button>
              )}
            </label>

            {!isLoading && (
              <p
                className="shrink-0 text-xs font-medium text-[var(--text-muted)]"
                aria-live="polite"
              >
                {resultLabel}
              </p>
            )}
          </div>
        </section>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-4 lg:px-5 lg:pb-8">
        <div className="w-full">
          {isLoading && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={`style-memory-skeleton-${index}`} />
              ))}
            </div>
          )}

          {showAuthRequired && (
            <StatePresenter
              status="authRequired"
              title="Log in to view Style Memory"
              description="Log in to view saved Style Memories. Your workspace snapshot stays preserved, so you can return to the same reference and prompt after signing in."
              primaryActionLabel="Log in"
              secondaryActionLabel="Back to Workspace"
              onPrimaryAction={handleLogin}
              onSecondaryAction={goToWorkspace}
            />
          )}

          {showFailedRecoverable && (
            <StatePresenter
              status="failedRecoverable"
              title="Style Memory service is temporarily unavailable"
              description={`${error?.message ?? "The Style Memory service could not load."} Your workspace context remains preserved. Retry or return to Workspace before the next attempt.`}
              primaryActionLabel="Retry"
              secondaryActionLabel="Back to Workspace"
              onPrimaryAction={handleRetry}
              onSecondaryAction={goToWorkspace}
            />
          )}

          {showEmpty && (
            <StatePresenter
              status="empty"
              title="No Style Memory saved yet"
              description="A Style Memory will keep source images, variable structure, and reuse intent. Start from a reference in the workspace, then save a direction when the prompt feels reusable."
              primaryActionLabel="Create from Reference"
              secondaryActionLabel="Open Workspace"
              onPrimaryAction={goToWorkspace}
              onSecondaryAction={goToWorkspace}
            />
          )}

          {showNoResults && (
            <StatePresenter
              status="noResults"
              title="No Style Memories found"
              description="No saved memory matches this search. The Style Memory context is still here; clear the search or return to Workspace to create a new reusable direction."
              primaryActionLabel="Clear Search"
              secondaryActionLabel="Back to Workspace"
              onPrimaryAction={() => setSearch("")}
              onSecondaryAction={goToWorkspace}
            />
          )}

          {actionError && showGrid && (
            <div className="mb-4">
              <StatePresenter
                compact
                status="failedRecoverable"
                title="Style Memory action did not complete"
                description={`${actionError} Your Style Memory list remains available, and no workspace context was removed.`}
                primaryActionLabel="Retry"
                secondaryActionLabel="Back to Workspace"
                onPrimaryAction={handleRetry}
                onSecondaryAction={goToWorkspace}
              />
            </div>
          )}

          {showGrid && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleMemories.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={handleUseTemplate}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
