import { GoogleGenAI } from "@google/genai";
import { STRUCTURER_SYSTEM_PROMPT } from "../prompts";
import { STRUCTURER_RESPONSE_JSON_SCHEMA } from "../structured-output-schema";
import { log } from "../log";
import type { StructurerProvider, StructurerContext } from "./types";

const MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 30_000;

export class GeminiStructurerProvider implements StructurerProvider {
  readonly name = "gemini" as const;
  private client: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async structure(params: {
    rawAnalysis: string;
    context?: StructurerContext;
  }): Promise<string> {
    const startedAt = Date.now();
    const meta = {
      provider: this.name,
      taskId: params.context?.taskId ?? "unknown",
      source: params.context?.source ?? "unknown",
      model: MODEL,
      rawAnalysisLength: params.rawAnalysis.length,
    };

    try {
      const response = await Promise.race([
        this.client.models.generateContent({
          model: MODEL,
          contents: [
            {
              role: "user",
              parts: [
                ...(params.context?.imageUrl
                  ? [
                      {
                        fileData: {
                          fileUri: params.context.imageUrl,
                          mimeType: params.context.mimeType ?? "image/jpeg",
                        },
                      },
                    ]
                  : []),
                {
                  text: `Here is the visual analysis to structure:\n\n${params.rawAnalysis}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction: STRUCTURER_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseJsonSchema: STRUCTURER_RESPONSE_JSON_SCHEMA,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Structure analysis timed out after 30s")),
            TIMEOUT_MS
          )
        ),
      ]);

      const text = response.text;
      log("structurer_provider_response_received", {
        ...meta,
        duration: Date.now() - startedAt,
        hasText: Boolean(text),
        textLength: text?.length ?? 0,
      });

      if (!text) {
        throw new Error("Structurer model returned empty response");
      }

      return text;
    } catch (error) {
      log("structurer_provider_failed", {
        ...meta,
        duration: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : "UnknownError",
        error: error instanceof Error ? error.message : "Unknown structurer provider error",
      });
      throw error;
    }
  }
}
