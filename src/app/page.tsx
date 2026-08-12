import { Hero } from "@/components/landing/hero";
import { UploadEntry } from "@/components/landing/upload-entry";
import { ValueSection } from "@/components/landing/value-section";
import { StatsSection } from "@/components/landing/stats-section";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-[var(--surface-page)]">
      <Hero />
      <div className="relative z-10 pb-6 pt-2">
        <UploadEntry />
      </div>
      <ValueSection />
      <StatsSection />
      <Footer />
    </main>
  );
}
