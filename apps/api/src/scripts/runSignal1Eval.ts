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
  // C001 shirt seam tear — legitimate apparel; Signal 1 should stay calm.
  C001: { want: "plausible, NO hard flag (real seam tear)", ok: plausibleNoFlag },
  // C002 visor scratch — fraud, but the scratch is plausible; behaviour catches it, not Signal 1.
  C002: { want: "NOT a hard flag (behaviour catches it, not this)", ok: (o) => !isHardFlag(o) },
  // C003/C004 skincare jar — reuse pair; the image-reuse signal decides.
  C003: { want: "NOT a hard flag (reuse signal decides)", ok: (o) => !isHardFlag(o) },
  C004: { want: "NOT a hard flag (reuse signal decides)", ok: (o) => !isHardFlag(o) },
  // C005 mug — fraud caught by behaviour (risky account), not Signal 1; image reads as plausible ceramic
  // cracking and the claimed text-image mismatch isn't actually present, so Signal 1 only must not hard-flag.
  C005: { want: "NOT a hard flag (behaviour catches it, not Signal 1)", ok: (o) => !isHardFlag(o) },
  // C006 glass frame — real shatter; false-positive anchor, must stay plausible.
  C006: { want: "plausible, NO hard flag (false-positive trap: real shattered glass)", ok: plausibleNoFlag },
  // C007 USB hub — real transit damage; should stay plausible.
  C007: { want: "plausible, NO hard flag (real transit damage)", ok: plausibleNoFlag },
  // C008 monitor — real cracked LCD; should stay plausible.
  C008: { want: "plausible, NO hard flag (real cracked LCD)", ok: plausibleNoFlag },
  // C009 SSL 2 — the image is too subtle for a reliable S1 hard flag (knob-off is a *normal* failure
  // mode; the panel marks read as scratches). Conviction comes from Signal 2: ssl2_broken.jpg is
  // doctored from ssl2_intact.jpg (identical composition) → the pHash reference-match flags it. So
  // Signal 1's result is not gating here; any non-error result is acceptable.
  C009: { want: "Signal 2 reference-match owns this (S1 result not gating)", ok: () => true },
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
