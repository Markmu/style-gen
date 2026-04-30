import { Suspense } from "react";
import { AuthHeader } from "@/components/auth/auth-header";
import { Hero } from "@/components/landing/hero";
import { UploadEntry } from "@/components/landing/upload-entry";
import { ValueSection } from "@/components/landing/value-section";
import { StatsSection } from "@/components/landing/stats-section";
import { BottomCta } from "@/components/landing/bottom-cta";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <>
      <Suspense>
        <AuthHeader />
      </Suspense>
      <main className="min-h-screen bg-[var(--surface-page)]">
        <Hero />
        <div className="-mt-14 pb-12">
          <UploadEntry />
        </div>
        <ValueSection />
        <StatsSection />
        <BottomCta />
        <Footer />
      </main>
    </>
  );
}
