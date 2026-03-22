import { Hero } from "@/components/landing/hero";
import { UploadEntry } from "@/components/landing/upload-entry";
import { ValueSection } from "@/components/landing/value-section";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <Hero />
      <div className="pb-12">
        <UploadEntry />
      </div>
      <ValueSection />
      <div className="pb-24 pt-4">
        <UploadEntry />
      </div>
    </main>
  );
}
