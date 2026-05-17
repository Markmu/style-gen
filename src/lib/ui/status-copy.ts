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
    title: "Ready to Start",
    description: "Add a reference image or choose a template to begin your next creation.",
    primaryActionLabel: "Add Reference",
    secondaryActionLabel: "Browse Templates",
    tone: "neutral",
  },
  loading: {
    status: "loading",
    title: "Loading",
    description: "Content is entering the workspace. Please wait a moment.",
    tone: "neutral",
  },
  queued: {
    status: "queued",
    title: "Queued",
    description: "The task is queued. Your current work is preserved while you wait or return to editing.",
    primaryActionLabel: "Keep Waiting",
    secondaryActionLabel: "Back to Edit",
    tone: "warning",
  },
  processing: {
    status: "processing",
    title: "Processing",
    description: "The system is processing the current request. Reference content and inputs stay in place.",
    secondaryActionLabel: "Back to Edit",
    tone: "accent",
  },
  success: {
    status: "success",
    title: "Done",
    description: "The result is ready. Continue editing, download, or generate again.",
    primaryActionLabel: "Keep Editing",
    secondaryActionLabel: "Generate Again",
    tone: "success",
  },
  failedRecoverable: {
    status: "failedRecoverable",
    title: "Recoverable",
    description: "This step did not finish, but reusable context was preserved.",
    primaryActionLabel: "Retry",
    secondaryActionLabel: "Back to Edit",
    tone: "danger",
  },
  restored: {
    status: "restored",
    title: "History Restored",
    description: "The historical result is back in the workspace. Refine the prompt or generate again.",
    primaryActionLabel: "Keep Editing",
    secondaryActionLabel: "Generate Again",
    tone: "success",
  },
  authRequired: {
    status: "authRequired",
    title: "Login Required",
    description: "Log in to continue this task. Page context will be preserved where possible.",
    primaryActionLabel: "Log in",
    secondaryActionLabel: "Back to Workspace",
    tone: "warning",
  },
  noResults: {
    status: "noResults",
    title: "No Matches",
    description: "Adjust keywords or clear search, then continue creating in the workspace.",
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
