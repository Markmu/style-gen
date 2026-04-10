import Replicate from "replicate";
import { STRUCTURER_SYSTEM_PROMPT } from "../prompts";
import type { StructurerProvider } from "./types";

const MODEL = "google/gemini-2.5-flash";
const TIMEOUT_SECONDS = 30;

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...data,
  }));
}

function normalizeOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output)) {
    const parts = output.filter(
      (item): item is string => typeof item === "string"
    );
    return parts.join("").trim();
  }

  return "";
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
    context?: { taskId?: string; source?: "analysis_route" | "analysis_webhook" };
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
