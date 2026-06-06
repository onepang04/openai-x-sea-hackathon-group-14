import { config as loadEnv } from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { claims, getEnrichedClaim } from "../data/load";
import type { EnrichedClaim } from "../types";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
// The workspace runs with cwd apps/api, so load the repo-root .env explicitly.
loadEnv({ path: join(REPO_ROOT, ".env") });
const PROMPT_PATH = join(REPO_ROOT, "signal-1-prompt.md");
const CLAIM_IMG_DIR = join(REPO_ROOT, "data", "images", "claims");

// ---- The strict-JSON schema the model must return (see signal-1-tuning-notes.md). ----
// Under response_format json_schema strict mode, every property must be listed in `required`.
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

// ---- Per-claim user message, built from the EnrichedClaim (signal-1-tuning-notes.md). ----
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

// ---- Output -> risk mapping (signal-1-tuning-notes.md). Risk is DERIVED; the tuning oracle
// is the model's own fields + the hard flag, which are printed in full below. ----
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
        ? { risk: 0.2 - 0.15 * c, confidence: c } // 0.05-0.20 (confident+match => low)
        : { risk: 0.45 + 0.15 * c, confidence: c }; // 0.45-0.60 (mismatch is suspicious)
    case "uncertain":
    default:
      return { risk: 0.45, confidence: Math.min(c, 0.5) }; // cap confidence at 0.5
  }
}

const isHardFlag = (o: Signal1Output) =>
  o.physical_plausibility === "implausible" && o.confidence > 0.85;

// ---- Signal-1 tuning oracle (from the checklist in signal-1-tuning-notes.md). ----
// NOTE: this checks SIGNAL 1 in isolation, not the aggregated band (that needs all 3 signals).
interface Expectation {
  want: string;
  ok: (o: Signal1Output) => boolean;
}
const plausibleNoFlag = (o: Signal1Output) =>
  o.physical_plausibility === "plausible" && !isHardFlag(o);

const EXPECTATIONS: Record<string, Expectation> = {
  // --- Legitimate claims: the false-positive anchors. Signal 1 must rate them plausible, no flag. ---
  C004: { want: "plausible, NO flag (legit visor scratch + colour)", ok: plausibleNoFlag },
  C007: { want: "plausible, NO flag (legit skincare packaging damage)", ok: plausibleNoFlag },
  C009: { want: "plausible, NO flag (legit mug print smudge)", ok: plausibleNoFlag },
  C010: { want: "plausible, NO flag (logistics cluster, real plastic crack)", ok: plausibleNoFlag },
  C011: { want: "plausible, NO flag (logistics cluster, real plastic crack)", ok: plausibleNoFlag },
  C012: { want: "plausible, NO flag (logistics cluster, real plastic crack)", ok: plausibleNoFlag },
  C014: { want: "plausible, NO flag (legit glass shatter)", ok: plausibleNoFlag },
  C016: { want: "plausible, NO flag (legit USB connector break)", ok: plausibleNoFlag },

  // --- Behaviour-only / reuse frauds: damage is physically plausible, so Signal 1 must NOT hard-flag;
  //     conviction comes from Signal 3 (behaviour) or Signal 2 (image reuse). ---
  C001: { want: "NOT a hard flag (behaviour catches it)", ok: (o) => !isHardFlag(o) },
  C003: { want: "NOT a hard flag (behaviour catches it)", ok: (o) => !isHardFlag(o) },
  C005: { want: "NOT a hard flag (image-reuse pair catches it)", ok: (o) => !isHardFlag(o) },
  C006: { want: "NOT a hard flag (behaviour catches it)", ok: (o) => !isHardFlag(o) },
  C013: { want: "NOT a hard flag (behaviour catches it)", ok: (o) => !isHardFlag(o) },
  C015: { want: "NOT a hard flag (behaviour catches it)", ok: (o) => !isHardFlag(o) },
  C017: { want: "NOT a hard flag (behaviour catches it)", ok: (o) => !isHardFlag(o) },
  C018: { want: "NOT a hard flag (behaviour catches it)", ok: (o) => !isHardFlag(o) },
  C020: { want: "NOT a hard flag (image-reuse pair catches it)", ok: (o) => !isHardFlag(o) },

  // --- C019 SSL 2: borderline for Signal 1 (knob-off is a normal failure mode; the panel marks read as
  //     scratches). Conviction comes from Signal 2's reference-match (doctored from ssl2_intact.jpg), so
  //     Signal 1's result is not gating — any non-error result is acceptable. ---
  C019: { want: "Signal 2 reference-match owns this (S1 not gating)", ok: () => true },
};

async function evaluateClaim(client: OpenAI, model: string, system: string, claimId: string) {
  const e = getEnrichedClaim(claimId);
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

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "signal1", schema: RESPONSE_SCHEMA, strict: true },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("empty model response");
  return JSON.parse(raw) as Signal1Output;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_VISION_MODEL;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set (add it to .env)");
  if (!model) throw new Error("OPENAI_VISION_MODEL is not set (add it to .env)");

  const system = readFileSync(PROMPT_PATH, "utf-8");
  const client = new OpenAI({ apiKey });

  // Only claims that have a Signal-1 expectation, in order.
  const targets = claims.map((c) => c.id).filter((id) => id in EXPECTATIONS);
  console.log(`Model: ${model}\nPrompt: signal-1-prompt.md (${system.length} chars)\n`);

  let passes = 0;
  for (const claimId of targets) {
    const exp = EXPECTATIONS[claimId];
    try {
      const o = await evaluateClaim(client, model, system, claimId);
      const { risk, confidence } = mapToRisk(o);
      const ok = exp.ok(o);
      if (ok) passes++;

      console.log(`${ok ? "PASS" : "FAIL"}  ${claimId}  — want: ${exp.want}`);
      console.log(
        `      plausibility=${o.physical_plausibility}  confidence=${o.confidence.toFixed(2)}` +
          `  text_image_match=${o.text_image_match}  hardFlag=${isHardFlag(o)}`,
      );
      console.log(`      -> risk=${risk.toFixed(2)}  signalConfidence=${confidence.toFixed(2)}`);
      if (o.contradictions.length)
        console.log(`      contradictions: ${o.contradictions.join(" | ")}`);
      if (o.mismatches.length) console.log(`      mismatches: ${o.mismatches.join(" | ")}`);
      console.log(`      reasoning: ${o.plausibility_reasoning}\n`);
    } catch (err) {
      console.log(`ERROR ${claimId}: ${(err as Error).message}\n`);
    }
  }

  console.log(`\n${passes}/${targets.length} claims meet the Signal-1 expectation.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
