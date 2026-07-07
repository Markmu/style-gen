import type { TemplateListItem } from "@/hooks/use-template-search";

export interface StyleMemoryCardViewModel {
  id: string;
  name: string;
  sourceImageUrl: string | null;
  sourceAlt: string;
  variableCount: number;
  variableLabel: string;
  styleTags: string[];
  reuseIntent: string;
  createdAt: string;
  actions: {
    useLabel: string;
    duplicateLabel: string;
    deleteLabel: string;
  };
}

const NAME_STOP_WORDS = new Set([
  "memory",
  "style",
  "template",
  "prompt",
  "structure",
  "only",
  "the",
  "and",
]);

const NAME_TAG_RULES: Array<[RegExp, string]> = [
  [/\beditorial\b/i, "Editorial"],
  [/\b(soft|diffused|daylight|light)\b/i, "Soft light"],
  [/\bmacro\b/i, "Macro"],
  [/\b(product|packshot)\b/i, "Product"],
  [/\b(studio|atelier)\b/i, "Studio"],
  [/\b(cinematic|film)\b/i, "Cinematic"],
  [/\b(glass|translucent)\b/i, "Glass"],
  [/\b(minimal|quiet|precision)\b/i, "Precision"],
];

function toTitleTag(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function deriveNameTags(name: string) {
  const ruleTags = NAME_TAG_RULES.flatMap(([pattern, tag]) =>
    pattern.test(name) ? [tag] : [],
  );

  const fallbackTags = name
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 2)
    .filter((part) => !NAME_STOP_WORDS.has(part.toLowerCase()))
    .slice(0, 2)
    .map(toTitleTag);

  return [...ruleTags, ...fallbackTags];
}

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function deriveStyleMemoryCardViewModel(
  template: TemplateListItem,
): StyleMemoryCardViewModel {
  const hasSourceImage = Boolean(template.sourceImageUrl);
  const variableLabel =
    template.variableCount === 1
      ? "1 variable"
      : `${template.variableCount} variables`;

  const styleTags = uniqueTags([
    hasSourceImage ? "Source-backed" : "Prompt-only",
    template.variableCount > 0 ? "Variable structure" : "Fixed prompt",
    ...deriveNameTags(template.name),
  ]).slice(0, 5);

  let reuseIntent: string;
  if (!hasSourceImage) {
    reuseIntent = "Prompt-only memory; reuse the prompt structure directly.";
  } else if (template.variableCount > 1) {
    reuseIntent = `Reuse with ${template.variableCount} editable variables from the source-backed style.`;
  } else if (template.variableCount === 1) {
    reuseIntent = "Swap the editable variable while keeping source style cues.";
  } else {
    reuseIntent = "Reuse the source-backed style direction as a fixed prompt.";
  }

  return {
    id: template.id,
    name: template.name,
    sourceImageUrl: template.sourceImageUrl,
    sourceAlt: `Reference image for ${template.name}`,
    variableCount: template.variableCount,
    variableLabel,
    styleTags,
    reuseIntent,
    createdAt: template.createdAt,
    actions: {
      useLabel: "Use memory",
      duplicateLabel: "Duplicate",
      deleteLabel: "Delete",
    },
  };
}
