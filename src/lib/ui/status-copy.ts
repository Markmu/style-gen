export type ProductStatus =
  | "empty"
  | "loading"
  | "queued"
  | "processing"
  | "success"
  | "failedRecoverable"
  | "restored"
  | "authRequired"
  | "noResults";

export type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface StatusCopy {
  status: ProductStatus;
  title: string;
  description: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  tone: StatusTone;
}

export type StatusCopyOverride = Partial<
  Omit<StatusCopy, "status" | "tone"> & { tone: StatusTone }
>;

export const PRODUCT_STATUS_COPY: Record<ProductStatus, StatusCopy> = {
  empty: {
    status: "empty",
    title: "Ready for Reference",
    description:
      "No reference is active yet. The workspace is clear, and the next step is to add an image or reuse a Style Memory.",
    primaryActionLabel: "Add Reference",
    secondaryActionLabel: "Browse Style Memory",
    tone: "neutral",
  },
  loading: {
    status: "loading",
    title: "Restoring Context",
    description:
      "Workspace content is loading. Existing reference, prompt, and memory context stay in place while the view catches up.",
    tone: "neutral",
  },
  queued: {
    status: "queued",
    title: "Still Queued",
    description:
      "The AI has been waiting for more than 60 seconds. Your reference and prompt are kept, and you can keep waiting or return to editing.",
    primaryActionLabel: "Keep Waiting",
    secondaryActionLabel: "Back to Edit",
    tone: "warning",
  },
  processing: {
    status: "processing",
    title: "Reading Style Signals",
    description:
      "AI is reading the reference for color, composition, lighting, texture, and mood signals while your prompt remains available.",
    secondaryActionLabel: "Back to Edit",
    tone: "accent",
  },
  success: {
    status: "success",
    title: "Render Ready",
    description:
      "The result is ready. Your reference, prompt, and generated image are still available for editing, saving, or another render.",
    primaryActionLabel: "Keep Editing",
    secondaryActionLabel: "Generate Again",
    tone: "success",
  },
  failedRecoverable: {
    status: "failedRecoverable",
    title: "Recoverable Failure",
    description:
      "Analysis, generation, or the service was interrupted, but your reference, prompt, and context are still preserved. Retry or go back to edit before the next attempt.",
    primaryActionLabel: "Retry",
    secondaryActionLabel: "Back to Edit",
    tone: "danger",
  },
  restored: {
    status: "restored",
    title: "Iteration Restored",
    description:
      "A previous render is back in the workspace. Its reference and prompt context are kept so you can refine, compare, or render again.",
    primaryActionLabel: "Keep Editing",
    secondaryActionLabel: "Generate Again",
    tone: "success",
  },
  authRequired: {
    status: "authRequired",
    title: "Login Required",
    description:
      "Log in to continue this Style Memory or history action. The workspace context stays available so you can return after signing in.",
    primaryActionLabel: "Log in",
    secondaryActionLabel: "Back to Workspace",
    tone: "warning",
  },
  noResults: {
    status: "noResults",
    title: "No Style Memories Found",
    description:
      "No saved memory matches this search. Clear the search or return to the workspace to create a new reusable style direction.",
    primaryActionLabel: "Clear Search",
    secondaryActionLabel: "Back to Workspace",
    tone: "neutral",
  },
};

export const PRODUCT_STATUSES = Object.keys(PRODUCT_STATUS_COPY) as ProductStatus[];

export function getStatusCopy(
  status: ProductStatus,
  overrides: StatusCopyOverride = {},
): StatusCopy {
  const baseCopy = PRODUCT_STATUS_COPY[status];
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as StatusCopyOverride;

  return {
    ...baseCopy,
    ...definedOverrides,
    status,
    tone: definedOverrides.tone ?? baseCopy.tone,
  };
}
