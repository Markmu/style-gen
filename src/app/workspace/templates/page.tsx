"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, FileCode, Layers3, Search, X } from "lucide-react";
import { AppIcon } from "@/components/ui/app-icon";
import { StatePresenter } from "@/components/ui/state-presenter";
import { TemplateCard } from "@/components/workspace/template-card";
import { useTemplateSearch } from "@/hooks/use-template-search";
import type { TemplateVariable } from "@/types/models";

const WORKSPACE_STORAGE_KEY = "style-gen-workspace-state";
const WORKSPACE_STORAGE_VERSION = 4;

type FilterMode = "all" | "source-backed" | "prompt-only" | string;

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
      className="style-memory-card flex min-h-[25rem] flex-col rounded-2xl border border-[var(--border-static)]/60 bg-[var(--surface-panel)] p-0"
    >
      <div className="style-memory-source aspect-[16/10] w-full animate-pulse rounded-t-2xl bg-[var(--surface-low)] motion-reduce:animate-none" />
      <div className="flex flex-1 flex-col justify-between gap-3.5 p-4.5">
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded-md bg-[var(--surface-low)] motion-reduce:animate-none" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
        </div>
        <div className="space-y-1.5">
          <div className="h-2.5 w-16 animate-pulse rounded bg-[var(--surface-low)] motion-reduce:animate-none" />
          <div className="flex gap-1.5">
            <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--surface-low)] motion-reduce:animate-none" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--surface-low)] motion-reduce:animate-none" />
          </div>
        </div>
        <div className="h-14 w-full animate-pulse rounded-xl bg-[var(--surface-low)] motion-reduce:animate-none" />
        <div className="h-9 w-full animate-pulse rounded-xl bg-[var(--surface-low)] motion-reduce:animate-none" />
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

function StyleMemoryPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterMode>("all");

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

  // plan-05（Task 5）: `focus` 查询参数定位
  const focusParam = searchParams.get("focus");
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    if (focusParam) {
      setPendingFocusId(focusParam);
    }
  }, [focusParam]);

  useEffect(() => {
    if (!pendingFocusId || isLoading) return;

    const target =
      (templates ?? []).find((template) => template.id === pendingFocusId) ??
      null;
    if (target) {
      setFocusedId(target.id);
    }
    setPendingFocusId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [
    pendingFocusId,
    isLoading,
    templates,
    router,
    pathname,
    searchParams,
  ]);

  useEffect(() => {
    if (!focusedId) return;
    requestAnimationFrame(() => {
      document
        .querySelector('[data-testid="style-memory-card"][data-focused="true"]')
        ?.scrollIntoView?.({ block: "center" });
    });
  }, [focusedId]);

  // Global keyboard shortcut: `/` or `Cmd+K` focuses the search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hasSearched = search.trim().length > 0;
  const memories = useMemo(() => templates ?? [], [templates]);

  // Filter memories by both search keyword and activeFilter
  const visibleMemories = useMemo(() => {
    let result = memories;

    // First apply filter mode
    if (activeFilter === "source-backed") {
      result = result.filter((template) => Boolean(template.sourceImageUrl));
    } else if (activeFilter === "prompt-only") {
      result = result.filter((template) => !template.sourceImageUrl);
    } else if (activeFilter !== "all") {
      const tagQuery = activeFilter.toLowerCase();
      result = result.filter((template) =>
        template.name.toLowerCase().includes(tagQuery),
      );
    }

    // Then apply text search
    const keyword = search.trim().toLowerCase();
    if (!keyword) return result;

    return result.filter((template) =>
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
  }, [memories, search, activeFilter]);

  const hasMemories = visibleMemories.length > 0;
  const isFetchFailure = !isLoading && isError;
  const showAuthRequired = isFetchFailure && isAuthRequired;
  const showFailedRecoverable = isFetchFailure && !isAuthRequired;
  const showEmpty =
    !isLoading && !isFetchFailure && !hasSearched && memories.length === 0;
  const showNoResults =
    !isLoading &&
    !isFetchFailure &&
    (hasSearched || activeFilter !== "all") &&
    visibleMemories.length === 0;
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

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setActiveFilter("all");
  }, [setSearch]);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--surface-page)]"
      data-testid="style-memory-page"
    >
      {/* Precision Workbench Header */}
      <header className="shrink-0 px-4 pb-4 pt-6 sm:px-6 lg:px-8 lg:pb-5 lg:pt-7">
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-[var(--text-primary)] lg:text-[2.5rem]">
                Style Memory
              </h1>
              {!isLoading && !isFetchFailure && memories.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-static)]/60 bg-[var(--surface-control)]/80 px-2.5 py-0.5 font-mono text-xs font-medium text-[var(--text-secondary)] shadow-sm">
                  <AppIcon icon={Layers3} size={13} className="text-[var(--accent-primary)]" />
                  {memories.length} saved
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Keep visual directions you trust, then reuse them with a new subject or scene.
            </p>
          </div>
          {showGrid && (
            <button
              type="button"
              onClick={goToWorkspace}
              className="btn-secondary inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium shadow-sm transition-all hover:border-[var(--border-interactive)] active:scale-[0.98]"
            >
              <AppIcon icon={ArrowLeft} size={15} />
              Open Workspace
            </button>
          )}
        </div>
      </header>

      {/* Filter and Search Toolbar */}
      {!isFetchFailure && (
        <section
          aria-label="Style Memory search"
          className="shrink-0 space-y-3 px-4 pb-4 sm:px-6 lg:px-8"
        >
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <label className="style-memory-search group relative flex min-h-10 min-w-0 flex-1 items-center rounded-xl px-3 transition-all sm:max-w-xl">
              <span className="sr-only">Search Style Memory</span>
              <AppIcon
                icon={Search}
                size={16}
                className="shrink-0 text-[var(--text-muted)] transition-colors group-focus-within:text-[var(--accent-primary)]"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearch("");
                    searchInputRef.current?.blur();
                  }
                }}
                placeholder="Search by name, style, or source"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
              {isSearching && (
                <span
                  className="shrink-0 text-xs font-medium text-[var(--text-muted)]"
                  aria-live="polite"
                >
                  Searching
                </span>
              )}
              {hasSearched && !isSearching && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="interactive-lift flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label="Clear Search"
                >
                  <AppIcon icon={X} size={14} />
                </button>
              )}
              {!hasSearched && (
                <kbd
                  aria-hidden="true"
                  className="hidden sm:inline-flex items-center rounded border border-[var(--border-static)] bg-[var(--surface-low)]/80 px-1.5 py-0.5 text-[0.6875rem] font-mono text-[var(--text-muted)] shadow-xs pointer-events-none"
                >
                  /
                </kbd>
              )}
            </label>

            {/* Total Results Count */}
            {!isLoading && (
              <p
                className="shrink-0 font-mono text-xs font-medium text-[var(--text-muted)]"
                aria-live="polite"
              >
                {resultLabel}
              </p>
            )}
          </div>

          {/* Quick Category Filter Pills */}
          {!isLoading && memories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  activeFilter === "all"
                    ? "bg-[var(--accent-primary)] text-white shadow-xs"
                    : "border border-[var(--border-static)]/60 bg-[var(--surface-control)]/60 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span>All</span>
                <span className="font-mono text-[0.6875rem] opacity-75">({memories.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("source-backed")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  activeFilter === "source-backed"
                    ? "bg-[var(--accent-primary)] text-white shadow-xs"
                    : "border border-[var(--border-static)]/60 bg-[var(--surface-control)]/60 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                <AppIcon icon={Camera} size={12} />
                <span>Source-backed</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("prompt-only")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  activeFilter === "prompt-only"
                    ? "bg-[var(--accent-primary)] text-white shadow-xs"
                    : "border border-[var(--border-static)]/60 bg-[var(--surface-control)]/60 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                <AppIcon icon={FileCode} size={12} />
                <span>Prompt-only</span>
              </button>

              {(activeFilter !== "all" || hasSearched) && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)] hover:underline"
                >
                  <AppIcon icon={X} size={12} />
                  Reset filters
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Main Grid & State Presenter View */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6 lg:px-8">
        <div className="w-full">
          {isLoading && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
              onPrimaryAction={clearAllFilters}
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visibleMemories.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  focused={focusedId === template.id}
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

/** plan-05: useSearchParams 需要 Suspense 边界（Next.js 15 要求） */
export default function StyleMemoryPage() {
  return (
    <Suspense fallback={null}>
      <StyleMemoryPageInner />
    </Suspense>
  );
}
