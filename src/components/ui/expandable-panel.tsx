"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface ExpandablePanelProps {
  expanded: boolean;
  labelledBy: string;
  testId: string;
  onClose: () => void;
  children: ReactNode;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export function ExpandablePanel({
  expanded,
  labelledBy,
  testId,
  onClose,
  children,
}: ExpandablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!expanded) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const initialFocusTarget = panelRef.current?.querySelector<HTMLElement>(
      '[data-expand-toggle="true"]',
    );
    initialFocusTarget?.focus();

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [expanded]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!expanded) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !panelRef.current) return;

    const focusableElements = getFocusableElements(panelRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <>
      {expanded && (
        <div
          data-testid={`${testId}-backdrop`}
          className="fixed inset-0 z-[39] bg-[rgba(25,28,30,0.24)] backdrop-blur-sm"
          role="presentation"
          onMouseDown={onClose}
        />
      )}
      <div
        ref={panelRef}
        data-testid={testId}
        data-expanded={expanded ? "true" : "false"}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded ? "true" : undefined}
        aria-labelledby={expanded ? labelledBy : undefined}
        tabIndex={expanded ? -1 : undefined}
        onKeyDown={handleKeyDown}
        className={
          expanded
            ? "fixed inset-4 z-40 min-h-0 min-w-0 sm:inset-6"
            : "h-full min-h-0 min-w-0"
        }
      >
        {children}
      </div>
    </>
  );
}
