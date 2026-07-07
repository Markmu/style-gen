import type { EvidenceFacet, EvidenceFacetId } from "@/lib/evidence-facets";

export type PromptProvenanceMatchType = "exact" | "keyword" | "facet_only";

export interface PromptProvenanceSpan {
  facetId: EvidenceFacetId;
  label: string;
  summary: string;
  matchedText: string | null;
  startIndex: number | null;
  endIndex: number | null;
  matchType: PromptProvenanceMatchType;
}

const STOP_WORDS = new Set([
  "with",
  "and",
  "the",
  "for",
  "that",
  "this",
  "from",
  "into",
  "over",
  "under",
  "very",
  "style",
  "image",
  "visual",
]);

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function splitWords(value: string) {
  return normalizeForCompare(value)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

function uniqueCandidates(candidates: string[]) {
  const seen = new Set<string>();
  return candidates
    .map((candidate) => normalizeForCompare(candidate.replace(/[^\w\s-]/g, " ")))
    .map((candidate) => candidate.replace(/\s+/g, " ").trim())
    .filter((candidate) => candidate.length >= 4)
    .filter((candidate) => {
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      return true;
    })
    .sort((left, right) => right.length - left.length);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function candidateToPromptPattern(candidate: string) {
  const tokens = candidate.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (tokens.length === 0) return null;

  return new RegExp(tokens.join("[\\s\\W_]+"), "i");
}

function buildCandidates(facet: EvidenceFacet) {
  const chunks = facet.summary
    .split(/[,;·.()/]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const words = splitWords(facet.summary);
  const ngrams: string[] = [];

  for (let size = Math.min(5, words.length); size >= 1; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      ngrams.push(words.slice(index, index + size).join(" "));
    }
  }

  return uniqueCandidates([facet.summary, ...chunks, ...ngrams, facet.label]);
}

function findCandidate(promptText: string, candidates: string[]) {
  for (const candidate of candidates) {
    const pattern = candidateToPromptPattern(candidate);
    if (!pattern) continue;

    const match = pattern.exec(promptText);
    if (!match) continue;

    const matchedText = match[0];
    const startIndex = match.index;

    return {
      matchedText,
      startIndex,
      endIndex: startIndex + matchedText.length,
      matchType: candidate.split(/\s+/).length > 1 ? "exact" : "keyword",
    } as const;
  }

  return null;
}

export function derivePromptProvenanceSpans(
  promptText: string,
  facets: EvidenceFacet[],
): PromptProvenanceSpan[] {
  return facets.map((facet) => {
    const match = findCandidate(promptText, buildCandidates(facet));

    if (!match) {
      return {
        facetId: facet.id,
        label: facet.label,
        summary: facet.summary,
        matchedText: null,
        startIndex: null,
        endIndex: null,
        matchType: "facet_only",
      };
    }

    return {
      facetId: facet.id,
      label: facet.label,
      summary: facet.summary,
      matchedText: match.matchedText,
      startIndex: match.startIndex,
      endIndex: match.endIndex,
      matchType: match.matchType,
    };
  });
}
