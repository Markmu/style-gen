"use client";

import type { FloatingGenerateWindowProps } from "@/components/workspace/floating-generate-window";
import { FloatingGenerateWindow } from "@/components/workspace/floating-generate-window";

export function LightGeneratePanel(props: FloatingGenerateWindowProps) {
  return (
    <FloatingGenerateWindow
      {...props}
      testId="light-generate-panel"
      variant="embedded"
    />
  );
}
