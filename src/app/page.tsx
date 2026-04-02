import { Hero } from "@/components/landing/hero";
import { UploadEntry } from "@/components/landing/upload-entry";
import { ValueSection } from "@/components/landing/value-section";
import { BottomCta } from "@/components/landing/bottom-cta";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--surface-base)]">
      <Hero />
      <div className="pb-12">
        <UploadEntry />
      </div>
      <ValueSection />
      <BottomCta />
      <Footer />
    </main>
  );
}
