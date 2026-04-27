import {
  getStatusCopy,
  type ProductStatus,
  type StatusTone,
} from "@/lib/ui/status-copy";

interface StatePresenterProps {
  status: ProductStatus;
  title?: string;
  description?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  compact?: boolean;
}

const toneClassName: Record<StatusTone, string> = {
  neutral: "bg-[var(--surface-control)] text-[var(--text-secondary)]",
  accent: "bg-[var(--accent-primary-soft)] text-[var(--accent-primary)]",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  danger: "bg-[var(--color-error-soft)] text-[var(--color-error)]",
};

export function StatePresenter({
  status,
  title,
  description,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
  compact = false,
}: StatePresenterProps) {
  const copy = getStatusCopy(status, {
    title,
    description,
    primaryActionLabel,
    secondaryActionLabel,
  });

  return (
    <section
      aria-live={status === "failedRecoverable" ? "assertive" : "polite"}
      className={`surface-panel rounded-lg ${compact ? "p-4" : "p-6"}`}
      data-status={status}
    >
      <div className="flex items-start gap-4">
        <span
          className={`mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${toneClassName[copy.tone]}`}
          data-testid="state-presenter-tone"
        />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[var(--text-primary)]">
            {copy.title}
          </p>
          <p
            className={`mt-2 text-sm leading-6 text-[var(--text-secondary)] ${
              compact ? "max-w-xl" : "max-w-2xl"
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
