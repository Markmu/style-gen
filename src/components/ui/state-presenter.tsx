import {
  getStatusCopy,
  type ProductStatus,
  type StatusCopyOverride,
  type StatusTone,
} from "@/lib/ui/status-copy";

type StatePresenterVariant = "compact" | "full";

interface StatePresenterProps {
  status: ProductStatus;
  title?: string;
  description?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  tone?: StatusTone;
  copyOverride?: StatusCopyOverride;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  variant?: StatePresenterVariant;
  compact?: boolean;
}

const toneClassName: Record<StatusTone, string> = {
  neutral: "text-[var(--status-neutral-text)]",
  accent: "text-[var(--status-accent-text)]",
  success: "text-[var(--status-success-text)]",
  warning: "text-[var(--status-warning-text)]",
  danger: "text-[var(--status-danger-text)]",
};

export function StatePresenter({
  status,
  title,
  description,
  primaryActionLabel,
  secondaryActionLabel,
  tone,
  copyOverride,
  onPrimaryAction,
  onSecondaryAction,
  variant,
  compact = false,
}: StatePresenterProps) {
  const resolvedVariant = variant ?? (compact ? "compact" : "full");
  const directOverride = Object.fromEntries(
    Object.entries({
      title,
      description,
      primaryActionLabel,
      secondaryActionLabel,
      tone,
    }).filter(([, value]) => value !== undefined),
  ) as StatusCopyOverride;
  const copy = getStatusCopy(status, {
    ...copyOverride,
    ...directOverride,
  });

  return (
    <section
      aria-live={status === "failedRecoverable" ? "assertive" : "polite"}
      className={`ai-panel surface-panel rounded-lg ${
        resolvedVariant === "compact" ? "p-4" : "p-6"
      }`}
      data-status={status}
      data-variant={resolvedVariant}
    >
      <div className="flex items-start gap-4">
        <span
          className={`status-tone-dot mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${toneClassName[copy.tone]}`}
          data-tone={copy.tone}
          data-testid="state-presenter-tone"
        />
        <div className="min-w-0 flex-1">
          <p
            className={`font-semibold text-[var(--text-primary)] ${
              resolvedVariant === "compact" ? "text-sm" : "text-base"
            }`}
          >
            {copy.title}
          </p>
          <p
            className={`mt-2 text-sm leading-6 text-[var(--text-secondary)] ${
              resolvedVariant === "compact" ? "max-w-xl" : "max-w-2xl"
            }`}
          >
            {copy.description}
          </p>

          {(copy.primaryActionLabel || copy.secondaryActionLabel) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {copy.primaryActionLabel && (
                <button
                  className="btn-primary rounded-md px-4 py-2 text-sm font-medium"
                  onClick={onPrimaryAction}
                  type="button"
                >
                  {copy.primaryActionLabel}
                </button>
              )}
              {copy.secondaryActionLabel && (
                <button
                  className="btn-secondary rounded-md px-4 py-2 text-sm font-medium"
                  onClick={onSecondaryAction}
                  type="button"
                >
                  {copy.secondaryActionLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
