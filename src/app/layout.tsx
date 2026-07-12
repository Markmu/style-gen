import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Visoryn - Reference Image Style Recreation",
  description:
    "Upload a reference image, extract an editable visual style recipe, and generate a new image in the same style",
  applicationName: "Visoryn",
  icons: {
    icon: [{ url: "/visoryn-mark.svg", type: "image/svg+xml" }],
    shortcut: "/visoryn-mark.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Sora:wght@700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)]">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
