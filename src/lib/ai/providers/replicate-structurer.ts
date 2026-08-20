import Replicate from "replicate";
import { STRUCTURER_SYSTEM_PROMPT } from "../prompts";
import { log } from "../log";
import type { StructurerProvider, StructurerContext } from "./types";

const MODEL = "google/gemini-2.5-flash";
const TIMEOUT_SECONDS = 30;

function normalizeOutput(output: unknown): string {
  if (typeof output === "string") {
    return output.trim();
  }

  if (Array.isArray(output)) {
    const parts = output.filter(
      (item): item is string => typeof item === "string"
    );
    return parts.join("").trim();
  }

  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    for (const key of ["output", "text", "response", "content"]) {
      const text = normalizeOutput(record[key]);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function summarizeOutputShape(output: unknown): Record<string, unknown> {
  if (Array.isArray(output)) {
    return {
      outputType: "array",
      outputLength: output.length,
      itemTypes: [...new Set(output.map((item) => typeof item))],
    };
  }

  if (output && typeof output === "object") {
    return {
      outputType: "object",
      outputKeys: Object.keys(output as Record<string, unknown>).slice(0, 10),
    };
  }

  return {
    outputType: output === null ? "null" : typeof output,
  };
}

export class ReplicateStructurerProvider implements StructurerProvider {
  readonly name = "replicate" as const;
  private client: Replicate;

  constructor() {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error(
        "REPLICATE_API_TOKEN environment variable is required for Replicate provider"
      );
    }
    this.client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
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
      const output = await this.client.run(MODEL, {
        input: {
          prompt: `Here is the visual analysis to structure:\n\n${params.rawAnalysis}`,
          system_instruction: STRUCTURER_SYSTEM_PROMPT,
          temperature: 0,
          thinking_budget: 0,
        },
        wait: {
          mode: "block",
          timeout: TIMEOUT_SECONDS,
        },
      });

      const text = normalizeOutput(output);
      log("structurer_provider_response_received", {
        ...meta,
        duration: Date.now() - startedAt,
        hasText: Boolean(text),
        textLength: text.length,
        ...(text ? {} : summarizeOutputShape(output)),
      });

      if (!text) {
        throw new Error("Replicate structurer returned empty response");
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
