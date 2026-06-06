import { config as loadEnv } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { sanitizeClaim } from "../data/load";
import type { Band, EnrichedClaim, SignalResult } from "../types";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
loadEnv({ path: join(REPO_ROOT, ".env"), quiet: true });

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    recommendedAction: { type: "string", enum: ["Release", "Request evidence", "Escalate"] },
  },
  required: ["explanation", "recommendedAction"],
  additionalProperties: false,
} as const;

export interface NarrationInput {
  enrichedClaim: EnrichedClaim;
  riskScore: number;
  band: Band;
  hardFlag: string | null;
  signals: SignalResult[];
}

export interface Narration {
  explanation: string;
  recommendedAction: string;
}

export async function narrateScore(input: NarrationInput): Promise<Narration> {
  const fallback = fallbackNarration(input);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_NARRATOR_MODEL;

  if (!apiKey || !model) {
    return fallback;
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You write concise refund-claim risk explanations for human reviewers. Only cite the provided signal evidence. Do not invent facts, policies, or outcomes.",
        },
        {
          role: "user",
          content: JSON.stringify(buildNarratorPayload(input)),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "reviewer_narration", schema: RESPONSE_SCHEMA, strict: true },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<Narration>;
    if (!parsed.explanation || !isRecommendedAction(parsed.recommendedAction)) {
      return fallback;
    }

    return {
      explanation: parsed.explanation,
      recommendedAction: parsed.recommendedAction,
    };
  } catch {
    return fallback;
  }
}

function buildNarratorPayload(input: NarrationInput) {
  const { enrichedClaim, riskScore, band, hardFlag, signals } = input;

  return {
    claim: sanitizeClaim(enrichedClaim.claim),
    product: {
      id: enrichedClaim.product.id,
      name: enrichedClaim.product.name,
      category: enrichedClaim.product.category,
      material: enrichedClaim.product.material,
      price_sgd: enrichedClaim.product.price_sgd,
    },
    account: {
      id: enrichedClaim.account.id,
      account_age_days: enrichedClaim.account.account_age_days,
      total_orders: enrichedClaim.account.total_orders,
      total_refunds: enrichedClaim.account.total_refunds,
      claims_last_30_days: enrichedClaim.account.claims_last_30_days,
    },
    order: {
      id: enrichedClaim.order.id,
      items: enrichedClaim.order.items,
      total_claims_against_order: enrichedClaim.order.total_claims_against_order,
    },
    score: { riskScore, band, hardFlag },
    signals: signals.map((signal) => ({
      name: signal.name,
      risk: signal.risk,
      confidence: signal.confidence,
      evidence: signal.evidence,
    })),
  };
}

function fallbackNarration(input: NarrationInput): Narration {
  const action = actionForBand(input.band);
  const evidence = input.signals.map((signal) => `${signal.name}: ${signal.evidence}`);
  const evidenceText =
    evidence.length > 0
      ? evidence.join(" ")
      : "No signal evidence was available, so the score defaults to the lowest-risk band.";
  const hardFlagText = input.hardFlag ? ` A hard flag was triggered: ${input.hardFlag}.` : "";

  return {
    explanation: `Risk Score ${input.riskScore} is ${input.band}. ${evidenceText}${hardFlagText}`,
    recommendedAction: action,
  };
}

function actionForBand(band: Band): string {
  if (band === "Low") return "Release";
  if (band === "Elevated") return "Request evidence";
  return "Escalate";
}

function isRecommendedAction(value: unknown): value is Narration["recommendedAction"] {
  return value === "Release" || value === "Request evidence" || value === "Escalate";
}
