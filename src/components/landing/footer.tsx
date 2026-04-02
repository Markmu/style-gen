import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)]/15 py-8 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        © 2026 Visoryn · 基于 AI 的视觉风格分析工具
      </p>
      <div className="mt-3 flex justify-center gap-6">
        <Link
          href="#"
          className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          关于
        </Link>
        <Link
          href="#"
          className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          隐私
        </Link>
      </div>
    </footer>
  );
}
