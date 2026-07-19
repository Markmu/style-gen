import {
  STYLE_DIMENSIONS,
  STYLE_FINGERPRINT_SCORE_KEYS,
} from "@/types/models";

const nonEmptyString = {
  type: "string",
  minLength: 1,
  maxLength: 500,
} as const;

const evidenceList = {
  type: "array",
  minItems: 1,
  maxItems: 3,
  items: {
    type: "string",
    minLength: 1,
    maxLength: 240,
  },
} as const;

const confidence = {
  type: "number",
  minimum: 0,
  maximum: 1,
} as const;

const observation = {
  type: "object",
  additionalProperties: false,
  required: ["value", "evidence", "confidence"],
  properties: {
    value: nonEmptyString,
    evidence: evidenceList,
    confidence,
  },
} as const;

const styleProfileProperties = Object.fromEntries(
  STYLE_DIMENSIONS.map((dimension) => [
    dimension,
    {
      type: "array",
      maxItems: 5,
      items: observation,
    },
  ]),
);

const scoreProperties = Object.fromEntries(
  STYLE_FINGERPRINT_SCORE_KEYS.map((key) => [
    key,
    {
      type: ["number", "null"],
      minimum: 0,
      maximum: 1,
    },
  ]),
);

/** Provider-enforced syntax contract; semantic validation remains server-owned. */
export const STRUCTURER_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recipe"],
  properties: {
    recipe: {
      type: "object",
      additionalProperties: false,
      required: [
        "contentDescription",
        "styleProfile",
        "styleInvariants",
        "negativeConstraints",
        "styleFingerprint",
      ],
      properties: {
        contentDescription: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "subjectAttributes", "supportingElements"],
          properties: {
            summary: nonEmptyString,
            subject: nonEmptyString,
            subjectAttributes: {
              type: "array",
              maxItems: 20,
              items: nonEmptyString,
            },
            actionOrState: nonEmptyString,
            environment: nonEmptyString,
            supportingElements: {
              type: "array",
              maxItems: 20,
              items: nonEmptyString,
            },
            timeOrWeather: nonEmptyString,
          },
        },
        styleProfile: {
          type: "object",
          additionalProperties: false,
          required: [...STYLE_DIMENSIONS],
          properties: styleProfileProperties,
        },
        styleInvariants: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "kind",
              "dimension",
              "value",
              "evidence",
              "confidence",
              "sourceObservationIds",
            ],
            properties: {
              kind: { type: "string", enum: ["hard", "soft"] },
              dimension: { type: "string", enum: [...STYLE_DIMENSIONS] },
              value: nonEmptyString,
              evidence: evidenceList,
              confidence,
              sourceObservationIds: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: { type: "string", minLength: 1, maxLength: 64 },
              },
            },
          },
        },
        negativeConstraints: {
          type: "array",
          maxItems: 20,
          items: nonEmptyString,
        },
        styleFingerprint: {
          type: "object",
          additionalProperties: false,
          required: ["tokens", "scores"],
          properties: {
            tokens: {
              type: "array",
              maxItems: 12,
              items: { type: "string", minLength: 1, maxLength: 100 },
            },
            scores: {
              type: "object",
              additionalProperties: false,
              required: [...STYLE_FINGERPRINT_SCORE_KEYS],
              properties: scoreProperties,
            },
          },
        },
      },
    },
  },
} as const;
