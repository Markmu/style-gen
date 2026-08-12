// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

function mockSystemTheme(isDark: boolean) {
  const listeners = new Set<() => void>();
  const mediaQuery = {
    matches: isDark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
  return mediaQuery;
}

function mockLocalStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    get length() {
      return values.size;
    },
  } satisfies Storage;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  return storage;
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockLocalStorage();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preference");
    document.documentElement.style.colorScheme = "";
    mockSystemTheme(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers system, light, and dark choices with the current choice selected", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /theme: follow system/i }));

    expect(screen.getByRole("menu", { name: /choose theme/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /follow system/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: /^light/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /^dark/i })).toBeInTheDocument();
  });

  it("applies and persists an explicit dark choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: /theme: follow system/i }));
    await user.click(screen.getByRole("menuitemradio", { name: /^dark/i }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute("data-theme-preference", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: /theme: dark/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("restores a saved choice when mounted", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle placement="sidebar" />);

    expect(await screen.findByRole("button", { name: /theme: light/i })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
