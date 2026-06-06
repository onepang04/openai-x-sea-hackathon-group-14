import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { DATA_DIR } from "../data/load";
import type { EnrichedClaim, SignalResult } from "../types";

// signal-1-prompt.md lives at the repo root; DATA_DIR is <repo>/data.
const PROMPT_PATH = join(DATA_DIR, "..", "signal-1-prompt.md");
const CLAIM_IMG_DIR = join(DATA_DIR, "images", "claims");

// Strict-JSON schema the vision model must return (see signal-1-tuning-notes.md).
// Under json_schema strict mode every property must be listed in `required`.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    observed_damage_features: { type: "array", items: { type: "string" } },
    expected_failure_modes: { type: "array", items: { type: "string" } },
    contradictions: { type: "array", items: { type: "string" } },
    alternative_explanations: { type: "array", items: { type: "string" } },
    physical_plausibility: { type: "string", enum: ["plausible", "implausible", "uncertain"] },
    plausibility_reasoning: { type: "string" },
    text_image_match: { type: "boolean" },
    mismatches: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: [
    "observed_damage_features",
    "expected_failure_modes",
    "contradictions",
    "alternative_explanations",
    "physical_plausibility",
    "plausibility_reasoning",
    "text_image_match",
    "mismatches",
    "confidence",
  ],
  additionalProperties: false,
} as const;

interface Signal1Output {
  observed_damage_features: string[];
  expected_failure_modes: string[];
  contradictions: string[];
  alternative_explanations: string[];
  physical_plausibility: "plausible" | "implausible" | "uncertain";
  plausibility_reasoning: string;
  text_image_match: boolean;
  mismatches: string[];
  confidence: number;
}

let cachedPrompt: string | null = null;
function loadPrompt(): string {
  if (cachedPrompt === null) {
    cachedPrompt = readFileSync(PROMPT_PATH, "utf-8");
  }
  return cachedPrompt;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey });
  }
  return client;
}

// Per-claim user message, built from the EnrichedClaim (signal-1-tuning-notes.md).
function buildUserMessage(e: EnrichedClaim): string {
  return [
    `PRODUCT: ${e.product.name}`,
    `MATERIAL: ${e.product.material}`,
    `EXPECTED FAILURE MODES: ${e.product.typical_failure_modes.join("; ")}`,
    `BUYER'S CLAIM: "${e.claim.claim_text}"`,
    `REASON CATEGORY: ${e.claim.reason_category}`,
  ].join("\n");
}

function imageToDataUrl(filename: string): string {
  const bytes = readFileSync(join(CLAIM_IMG_DIR, filename));
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

// Output -> risk mapping (signal-1-tuning-notes.md).
function mapToRisk(o: Signal1Output): { risk: number; confidence: number } {
  const c = o.confidence;
  const match = o.text_image_match;
  switch (o.physical_plausibility) {
    case "implausible":
      return match
        ? { risk: 0.7 + 0.15 * c, confidence: c } // 0.70-0.85
        : { risk: 0.85 + 0.1 * c, confidence: c }; // 0.85-0.95
    case "plausible":
      return match
        ? { risk: 0.2 - 0.15 * c, confidence: c } // 0.05-0.20
        : { risk: 0.45 + 0.15 * c, confidence: c }; // 0.45-0.60
    case "uncertain":
    default:
      return { risk: 0.45, confidence: Math.min(c, 0.5) }; // cap confidence at 0.5
  }
}

/**
 * Signal 1 — Visual Claim Integrity. One OpenAI vision call over the claim image(s),
 * judging physical plausibility for the material and text-image consistency.
 * Throws on any failure so the aggregator's Promise.allSettled drops it (score over
 * available signals) rather than sinking the whole claim.
 */
export async function scoreVisualClaimIntegrity(e: EnrichedClaim): Promise<SignalResult> {
  const model = process.env.OPENAI_VISION_MODEL;
  if (!model) throw new Error("OPENAI_VISION_MODEL is not set");

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: buildUserMessage(e) },
    ...e.claim.images.map(
      (img) =>
        ({
          type: "image_url",
          image_url: { url: imageToDataUrl(img), detail: "high" },
        }) as const,
    ),
  ];

  const completion = await getClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: loadPrompt() },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "signal1", schema: RESPONSE_SCHEMA, strict: true },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("empty vision response");
  const o = JSON.parse(raw) as Signal1Output;

  const { risk, confidence } = mapToRisk(o);
  // Hard flag per signal-1-tuning-notes.md: implausible AND confidence > 0.85.
  const hardFlag = o.physical_plausibility === "implausible" && o.confidence > 0.85;
  const evidence = o.mismatches.length
    ? `${o.plausibility_reasoning} (mismatches: ${o.mismatches.join("; ")})`
    : o.plausibility_reasoning;

  return {
    name: "VisualClaimIntegrity",
    risk,
    confidence,
    evidence,
    raw: {
      physicalPlausibility: o.physical_plausibility,
      plausibilityReasoning: o.plausibility_reasoning,
      contradictions: o.contradictions,
      alternativeExplanations: o.alternative_explanations,
      textImageMatch: o.text_image_match,
      mismatches: o.mismatches,
      hardFlag,
      reason: hardFlag ? "high-confidence physical implausibility" : undefined,
      ...(hardFlag
        ? { hardFlagTrigger: "Implausible physical damage reported with high confidence." }
        : {}),
    },
  };
}
