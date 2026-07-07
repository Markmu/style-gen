"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { StatePresenter } from "@/components/ui/state-presenter";
import { TemplateCard } from "@/components/workspace/template-card";
import { useTemplateSearch } from "@/hooks/use-template-search";
import type { TemplateVariable } from "@/types/models";

const WORKSPACE_STORAGE_KEY = "style-gen-workspace-state";
const WORKSPACE_STORAGE_VERSION = 3;

interface TemplateDetailForWorkspace {
  content?: string;
  variables?: TemplateVariable[];
  sourceAssetId?: string | null;
  sourceImageUrl?: string | null;
}

function SkeletonCard() {
  return (
    <div className="style-memory-card flex min-h-[28rem] flex-col">
      <div className="style-memory-source aspect-[4/3] w-full animate-pulse" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-low)]" />
        <div className="h-7 w-28 animate-pulse rounded-full bg-[var(--surface-low)]" />
        <div className="flex gap-2">
          <div className="h-7 w-24 animate-pulse rounded-full bg-[var(--surface-low)]" />
          <div className="h-7 w-20 animate-pulse rounded-full bg-[var(--surface-low)]" />
        </div>
        <div className="mt-auto h-16 animate-pulse rounded-lg bg-[var(--surface-low)]" />
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 pb-4 pt-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-[var(--accent-primary)]">
              Reference {"->"} Evidence {"->"} Render
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
              Style Memory
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Saved style directions and prompt structure stay here so you can
              reuse source-backed visual evidence without changing the template
              API contract.
            </p>
          </div>
          <button
            type="button"
            onClick={goToWorkspace}
            className="btn-secondary w-fit rounded-md px-4 py-2 text-sm font-medium"
          >
            Back to Workspace
          </button>
        </div>
      </div>

      <div className="shrink-0 px-6 pb-4">
        <div className="surface-panel flex min-h-12 items-center gap-3 rounded-lg px-4 py-2">
          <span className="material-symbols-outlined text-lg text-[var(--text-secondary)]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            onInput={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search Style Memories by direction, source, or prompt structure..."
            className="input-precision min-w-0 flex-1 rounded-t-md px-0 py-2 text-sm"
          />
          {isSearching && (
            <span className="text-xs text-[var(--text-muted)]">
              Refining
            </span>
          )}
          {hasSearched && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="btn-secondary rounded-md px-3 py-1.5 text-xs"
              aria-label="Clear Search"
            >
              Clear Search
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
  );
}
