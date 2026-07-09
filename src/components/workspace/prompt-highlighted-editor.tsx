"use client";

import { useMemo, useRef, type UIEvent } from "react";
import type { EvidenceFacetId } from "@/lib/evidence-facets";
import type { PromptProvenanceSpan } from "@/lib/prompt-provenance";
import type {
  AnalysisTemplateSourceField,
  TemplateVariable,
} from "@/types/models";

type PromptHighlightMode = "template" | "text";
type AnnotationKind = "variable" | "provenance";

const HIDDEN_PROMPT_VARIABLES = new Set(["negative_prompt"]);
const TEMPLATE_VARIABLE_PATTERN = /{{([a-zA-Z_]\w*)}}/g;

const SOURCE_FIELD_FACET_MAP: Partial<Record<AnalysisTemplateSourceField, EvidenceFacetId>> = {
  subject: "subject",
  scene: "subject",
  visual_style: "mood",
  lighting_color: "lighting",
  composition: "composition",
  camera_language: "composition",
  texture: "texture",
  mood: "mood",
};

interface PromptHighlightedEditorProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  mode: PromptHighlightMode;
  minHeightClass: string;
  compact?: boolean;
  variables?: TemplateVariable[];
  variableValues?: Record<string, string>;
  provenanceSpans?: PromptProvenanceSpan[];
  selectedProvenanceSpan?: PromptProvenanceSpan | null;
  testId: string;
}

interface PromptAnnotation {
  kind: AnnotationKind;
  start: number;
  end: number;
  facetId: EvidenceFacetId | null;
  label: string;
  title: string;
  variableName?: string;
  provenanceFacetId?: EvidenceFacetId;
  matchType?: PromptProvenanceSpan["matchType"];
  selected?: boolean;
}

interface ProvenanceMarker {
  annotation: PromptAnnotation;
  visibleStart: number;
  visibleEnd: number;
}

function resolveVariableFacet(variable: TemplateVariable): EvidenceFacetId | null {
  if (variable.sourceField) {
    return SOURCE_FIELD_FACET_MAP[variable.sourceField] ?? null;
  }

  const normalizedName = variable.name.toLowerCase();
  if (normalizedName.includes("light")) return "lighting";
  if (normalizedName.includes("color") || normalizedName.includes("palette")) return "color";
  if (normalizedName.includes("composition") || normalizedName.includes("camera")) {
    return "composition";
  }
  if (normalizedName.includes("texture") || normalizedName.includes("material")) return "texture";
  if (normalizedName.includes("mood") || normalizedName.includes("style")) return "mood";
  if (normalizedName.includes("subject") || normalizedName.includes("scene")) return "subject";

  return null;
}

function hasOverlap(
  ranges: Array<Pick<PromptAnnotation, "start" | "end">>,
  start: number,
  end: number,
) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function findTextOccurrences(source: string, target: string) {
  const normalizedSource = source.toLowerCase();
  const normalizedTarget = target.toLowerCase();
  const occurrences: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = normalizedSource.indexOf(normalizedTarget, cursor);
    if (start === -1) break;
    const end = start + target.length;
    occurrences.push({ start, end });
    cursor = end;
  }

  return occurrences;
}

function buildTemplateVariableAnnotations(
  value: string,
  variables: TemplateVariable[],
  variableValues: Record<string, string>,
): PromptAnnotation[] {
  const variableByName = new Map(
    variables
      .filter((variable) => !HIDDEN_PROMPT_VARIABLES.has(variable.name))
      .map((variable) => [variable.name, variable]),
  );
  const annotations: PromptAnnotation[] = [];
  let match: RegExpExecArray | null;

  TEMPLATE_VARIABLE_PATTERN.lastIndex = 0;

  while ((match = TEMPLATE_VARIABLE_PATTERN.exec(value)) !== null) {
    const variable = variableByName.get(match[1]);
    if (!variable) continue;

    const facetId = resolveVariableFacet(variable);
    const variableValue = variableValues[variable.name] ?? variable.defaultValue ?? "";
    annotations.push({
      kind: "variable",
      start: match.index,
      end: match.index + match[0].length,
      facetId,
      label: variable.label || variable.name,
      title: variableValue
        ? `${variable.label || variable.name}: ${variableValue}`
        : variable.label || variable.name,
      variableName: variable.name,
    });
  }

  return annotations;
}

function buildTextVariableAnnotations(
  value: string,
  variables: TemplateVariable[],
  variableValues: Record<string, string>,
): PromptAnnotation[] {
  const annotations: PromptAnnotation[] = [];
  const candidates = variables
    .filter((variable) => !HIDDEN_PROMPT_VARIABLES.has(variable.name))
    .map((variable) => ({
      variable,
      text: (variableValues[variable.name] ?? variable.defaultValue ?? "").trim(),
    }))
    .filter((candidate) => candidate.text.length >= 2)
    .sort((left, right) => right.text.length - left.text.length);

  for (const { variable, text } of candidates) {
    for (const occurrence of findTextOccurrences(value, text)) {
      if (hasOverlap(annotations, occurrence.start, occurrence.end)) continue;

      const facetId = resolveVariableFacet(variable);
      annotations.push({
        kind: "variable",
        start: occurrence.start,
        end: occurrence.end,
        facetId,
        label: variable.label || variable.name,
        title: `${variable.label || variable.name}: ${value.slice(
          occurrence.start,
          occurrence.end,
        )}`,
        variableName: variable.name,
      });
    }
  }

  return annotations;
}

function buildProvenanceAnnotations(
  value: string,
  provenanceSpans: PromptProvenanceSpan[],
  selectedProvenanceSpan: PromptProvenanceSpan | null,
): PromptAnnotation[] {
  return provenanceSpans.flatMap((span) => {
    if (span.matchType === "facet_only") return [];

    let start = span.startIndex;
    let end = span.endIndex;

    if (
      start === null ||
      end === null ||
      start < 0 ||
      end > value.length ||
      start >= end
    ) {
      if (!span.matchedText) return [];
      const match = findTextOccurrences(value, span.matchedText)[0];
      if (!match) return [];
      start = match.start;
      end = match.end;
    }

    return [
      {
        kind: "provenance" as const,
        start,
        end,
        facetId: span.facetId,
        label: span.label,
        title: span.summary,
        provenanceFacetId: span.facetId,
        matchType: span.matchType,
        selected: selectedProvenanceSpan?.facetId === span.facetId,
      },
    ];
  });
}

function tokenProps(annotation: PromptAnnotation, claimedTestIds: Set<string>) {
  const testId =
    annotation.kind === "variable"
      ? `prompt-variable-token-${annotation.variableName}`
      : `prompt-provenance-span-${annotation.provenanceFacetId}`;
  const firstUse = !claimedTestIds.has(testId);
  claimedTestIds.add(testId);

  return {
    ...(firstUse ? { "data-testid": testId } : {}),
    ...(annotation.facetId ? { "data-facet": annotation.facetId } : {}),
    ...(annotation.kind === "provenance"
      ? {
          "data-selected": annotation.selected ? "true" : "false",
          "data-match-type": annotation.matchType,
        }
      : {}),
    className: "prompt-highlight-token",
    title: annotation.title,
  };
}

function provenanceForSegment(annotations: PromptAnnotation[], start: number, end: number) {
  return annotations.find(
    (annotation) => annotation.start <= start && annotation.end >= end,
  );
}

function renderProvenanceSegments(
  value: string,
  start: number,
  end: number,
  provenanceAnnotations: PromptAnnotation[],
  claimedTestIds: Set<string>,
  keyPrefix: string,
) {
  const boundaries = new Set([start, end]);

  for (const annotation of provenanceAnnotations) {
    if (annotation.start >= end || annotation.end <= start) continue;
    boundaries.add(Math.max(start, annotation.start));
    boundaries.add(Math.min(end, annotation.end));
  }

  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);

  return orderedBoundaries.flatMap((segmentStart, index) => {
    const segmentEnd = orderedBoundaries[index + 1];
    if (segmentEnd === undefined || segmentStart === segmentEnd) return [];

    const text = value.slice(segmentStart, segmentEnd);
    const provenance = provenanceForSegment(
      provenanceAnnotations,
      segmentStart,
      segmentEnd,
    );

    if (!provenance) return text;

    return (
      <span
        key={`${keyPrefix}-${segmentStart}-${segmentEnd}-provenance`}
        {...tokenProps(provenance, claimedTestIds)}
      >
        {text}
      </span>
    );
  });
}

function collectVariableProvenanceMarkers(
  variable: PromptAnnotation,
  provenanceAnnotations: PromptAnnotation[],
) {
  return provenanceAnnotations.flatMap<ProvenanceMarker>((annotation) => {
    if (annotation.start >= variable.end || annotation.end <= variable.start) {
      return [];
    }

    return [
      {
        annotation,
        visibleStart: Math.max(variable.start, annotation.start),
        visibleEnd: Math.min(variable.end, annotation.end),
      },
    ];
  });
}

function renderProvenanceMarkers(
  value: string,
  markers: ProvenanceMarker[],
  claimedTestIds: Set<string>,
) {
  return markers.map((marker) => (
    <span
      key={`marker-${marker.annotation.provenanceFacetId}-${marker.visibleStart}-${marker.visibleEnd}`}
      {...tokenProps(marker.annotation, claimedTestIds)}
      className="prompt-highlight-provenance-marker"
      title={marker.annotation.title}
      aria-hidden="true"
    >
      {value.slice(marker.visibleStart, marker.visibleEnd)}
    </span>
  ));
}

function renderHighlightedValue(
  value: string,
  variableAnnotations: PromptAnnotation[],
  provenanceAnnotations: PromptAnnotation[],
) {
  const claimedTestIds = new Set<string>();
  const segments = [];
  const sortedVariables = [...variableAnnotations].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return right.end - left.end;
  });
  let cursor = 0;

  for (const variable of sortedVariables) {
    if (variable.start < cursor) continue;

    if (cursor < variable.start) {
      segments.push(
        ...renderProvenanceSegments(
          value,
          cursor,
          variable.start,
          provenanceAnnotations,
          claimedTestIds,
          "plain",
        ),
      );
    }

    segments.push(
      <span
        key={`${variable.start}-${variable.end}-variable`}
        {...tokenProps(variable, claimedTestIds)}
      >
        {value.slice(variable.start, variable.end)}
        {renderProvenanceMarkers(
          value,
          collectVariableProvenanceMarkers(variable, provenanceAnnotations),
          claimedTestIds,
        )}
      </span>,
    );
    cursor = variable.end;
  }

  if (cursor < value.length) {
    segments.push(
      ...renderProvenanceSegments(
        value,
        cursor,
        value.length,
        provenanceAnnotations,
        claimedTestIds,
        "plain",
      ),
    );
  }

  if (value.endsWith("\n")) {
    segments.push(
      <span key="terminal-newline-spacer" aria-hidden="true">
        &nbsp;
      </span>,
    );
  }

  return segments;
}

export function PromptHighlightedEditor({
  ariaLabel,
  value,
  onChange,
  placeholder,
  mode,
  minHeightClass,
  compact = false,
  variables = [],
  variableValues = {},
  provenanceSpans = [],
  selectedProvenanceSpan = null,
  testId,
}: PromptHighlightedEditorProps) {
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const { variableAnnotations, provenanceAnnotations } = useMemo(() => {
    const variableAnnotations =
      mode === "template"
        ? buildTemplateVariableAnnotations(value, variables, variableValues)
        : buildTextVariableAnnotations(value, variables, variableValues);

    return {
      variableAnnotations,
      provenanceAnnotations:
        mode === "text"
          ? buildProvenanceAnnotations(value, provenanceSpans, selectedProvenanceSpan)
          : [],
    };
  }, [mode, provenanceSpans, selectedProvenanceSpan, value, variableValues, variables]);

  const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightLayerRef.current) return;

    highlightLayerRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightLayerRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  return (
    <div
      data-testid={testId}
      className={`prompt-highlight-editor input-precision ${minHeightClass}`}
    >
      <div
        ref={highlightLayerRef}
        aria-hidden="true"
        className={`prompt-highlight-layer absolute inset-0 overflow-auto px-3 text-sm leading-6 ${
          compact ? "py-1.5" : "py-3"
        }`}
      >
        {value ? (
          renderHighlightedValue(value, variableAnnotations, provenanceAnnotations)
        ) : (
          <span className="prompt-highlight-placeholder">{placeholder}</span>
        )}
      </div>
      <textarea
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={handleScroll}
        className={`prompt-highlight-textarea absolute inset-0 h-full w-full resize-none rounded-t-lg px-3 text-sm leading-6 ${
          compact ? "py-1.5" : "py-3"
        }`}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}
