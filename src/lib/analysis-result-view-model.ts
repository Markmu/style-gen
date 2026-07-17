import type {
  StoredVisualRecipe,
  StyleInvariant,
  VisualRecipeV2Success,
} from "@/types/models";
import { isVisualRecipeV2Success, toLegacyVisualRecipe } from "@/lib/visual-recipe";

export interface AnalysisResultViewModel {
  version: "v2" | "legacy";
  status: "ready" | "partial" | "legacy";
  summary: string;
  subject: string;
  tags: string[];
  contentLines: Array<{ label: string; value: string }>;
  invariants: StyleInvariant[];
  extractionReasons: string[];
  recipe: VisualRecipeV2Success | null;
}

export function deriveAnalysisResultViewModel(
  stored: StoredVisualRecipe,
): AnalysisResultViewModel {
  if (isVisualRecipeV2Success(stored)) {
    const content = stored.contentDescription;
    return {
      version: "v2",
      status: stored.extractionStatus,
      summary: content.summary,
      subject: content.subject ?? content.summary,
      tags: stored.styleFingerprint.tokens,
      contentLines: ([
        ["Subject", content.subject],
        ["Attributes", content.subjectAttributes.join(", ")],
        ["Action / state", content.actionOrState],
        ["Environment", content.environment],
        ["Supporting elements", content.supportingElements.join(", ")],
        ["Time / weather", content.timeOrWeather],
      ] as Array<[string, string | undefined]>).flatMap(([label, value]) =>
        value ? [{ label, value }] : [],
      ),
      invariants: stored.styleInvariants,
      extractionReasons: stored.extractionReasons,
      recipe: stored,
    };
  }

  const legacy = toLegacyVisualRecipe(stored);
  if (!legacy) {
    return {
      version: "legacy",
      status: "legacy",
      summary: "Legacy analysis",
      subject: "Legacy analysis",
      tags: [],
      contentLines: [],
      invariants: [],
      extractionReasons: [],
      recipe: null,
    };
  }
  return {
    version: "legacy",
    status: "legacy",
    summary: legacy.imageSummary,
    subject: legacy.subject,
    tags: legacy.styleTags,
    contentLines: [
      { label: "Subject", value: legacy.subject },
      { label: "Scene", value: legacy.scene },
    ],
    invariants: [],
    extractionReasons: [],
    recipe: null,
  };
}
