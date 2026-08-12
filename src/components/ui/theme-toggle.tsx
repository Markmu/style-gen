"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { AppIcon, type AppIconComponent } from "@/components/ui/app-icon";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: AppIconComponent;
}> = [
  {
    value: "system",
    label: "Follow system",
    description: "Match your device appearance",
    icon: Monitor,
  },
  {
    value: "light",
    label: "Light",
    description: "Use the bright studio theme",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use the dim editing theme",
    icon: Moon,
  },
];

function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(preference: ThemePreference, persist = true) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // The selected theme still applies when storage is unavailable.
    }
  }
}

interface ThemeToggleProps {
  placement?: "header" | "sidebar";
}

export function ThemeToggle({ placement = "header" }: ThemeToggleProps) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentOption =
    themeOptions.find((option) => option.value === preference) ?? themeOptions[0];

  const syncPreference = useCallback((nextPreference: ThemePreference) => {
    setPreference(nextPreference);
    applyTheme(nextPreference);
  }, []);

  useEffect(() => {
    const initialPreference = document.documentElement.dataset.themePreference;
    const storedPreference = (() => {
      try {
        return window.localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    const nextPreference = isThemePreference(initialPreference)
      ? initialPreference
      : isThemePreference(storedPreference)
        ? storedPreference
        : "system";

    setPreference(nextPreference);
    applyTheme(nextPreference, false);
  }, []);

  useEffect(() => {
    if (preference !== "system" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => applyTheme("system", false);
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [preference]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextPreference = (event as CustomEvent<ThemePreference>).detail;
      if (isThemePreference(nextPreference)) setPreference(nextPreference);
    };
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (nextPreference: ThemePreference) => {
    syncPreference(nextPreference);
    window.dispatchEvent(
      new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, {
        detail: nextPreference,
      }),
    );
    setIsOpen(false);
  };

  const CurrentIcon = currentOption.icon;
  const isSidebar = placement === "sidebar";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={
          isSidebar
            ? "theme-toggle flex min-h-11 w-full items-center justify-center rounded-lg px-2 md:justify-start md:gap-3 md:px-3"
            : "theme-toggle flex h-9 w-9 items-center justify-center rounded-lg"
        }
        aria-label={`Theme: ${currentOption.label}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <AppIcon icon={CurrentIcon} size={18} />
        {isSidebar && (
          <span className="hidden min-w-0 truncate text-sm font-semibold md:inline">
            {currentOption.label}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={`theme-menu absolute z-50 w-64 rounded-xl p-1.5 ${
            isSidebar ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"
          }`}
          role="menu"
          aria-label="Choose theme"
        >
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={preference === option.value}
              onClick={() => handleSelect(option.value)}
              className="theme-menu-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-control)] text-[var(--text-secondary)]">
                <AppIcon icon={option.icon} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">
                  {option.label}
                </span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {option.description}
                </span>
              </span>
              {preference === option.value && (
                <AppIcon
                  icon={Check}
                  size={16}
                  className="shrink-0 text-[var(--accent-primary)]"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
