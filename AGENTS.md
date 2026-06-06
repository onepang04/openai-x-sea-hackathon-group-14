# AGENTS.md — Claim-Integrity Agent

Context for Codex. Read this before any task.

## What this project is

A refund-claim integrity system for a Shopee-style marketplace. It ingests a refund claim (buyer text + photo + product + account context) and produces a **0–100 Risk Score**, a band (Low / Elevated / High), and a plain-English explanation for a human reviewer. Hackathon demo — not production.

## Architecture

```
React frontend  ->  Node/TS backend  ->  OpenAI (vision: Signal 1)
(claim list,        (signal runner,       SEA-LION (narrator:
 verdict card)       aggregator,           reviewer explanation)
                     LLM narrator)
                          |
                  in-memory JSON data
                  (claims/accounts/products/orders + pHash index)
```

## The Signal interface (every signal implements this)

```ts
interface Signal {
  name: string;
  evaluate(claim: EnrichedClaim): Promise<SignalResult>;
}

interface SignalResult {
  name: string;
  risk: number;        // 0..1
  confidence: number;  // 0..1
  evidence: string;    // human-readable
  raw?: unknown;       // for hard-flag checks
}
```

`EnrichedClaim` = a claim joined with its account, product, and order records.

## The three signals

1. **VisualClaimIntegrity** — one OpenAI vision call: is the damage physically plausible for the material, and does the image match the claim text. (The prompt lives in `signal-1-prompt.md` — do not rewrite it; load it from disk.)
2. **ImageReuse** — pHash (sharp + imghash) across all claim images; Hamming distance < 5 is a hard flag.
3. **BehaviouralContext** — deterministic rules over account + order data; includes the shared-order-ID → logistics-incident override that *lowers* risk.

## Aggregation

```
score01 = Σ(weight·risk·confidence) / Σ(weight·confidence)   // available signals only
```
Weights: Visual 1.0, ImageReuse 0.9, Behavioural 0.7.
Then: `riskScore = round(score01 * 100)`; band = Low(<30) / Elevated(30–65) / High(>65).
Hard-flag overrides force High. Missing signals drop from both sums.
A final **SEA-LION** call (AI Singapore's regional model, via its OpenAI-compatible API) turns (score, band, evidences) into the reviewer explanation + recommended action.

## Tech stack (do not substitute)

- Backend: Node + TypeScript + Express, `openai`, `sharp`, `imghash`.
- Models: two clients via the `openai` SDK — OpenAI (Signal 1 vision call) and SEA-LION (narrator; base URL `https://api.sea-lion.ai/v1`, separate `SEA_LION_API_KEY`). SEA-LION has no vision model, so the vision call must stay on OpenAI.
- Frontend: React + TypeScript + Tailwind, built with Vite.
- Data: JSON files in `data/`, loaded into memory at startup.

## Hard anti-scope rules (DO NOT)

- ❌ No database, no ORM. JSON in memory only.
- ❌ No auth, no login, no user accounts.
- ❌ No deployment config, Docker, or CI.
- ❌ No new signals beyond the three above.
- ❌ No metadata/EXIF signal, no third-party AI-detector signal.
- ❌ Do not invent fields not present in the JSON schemas.

## Conventions

- Keep each signal in its own file under `src/signals/`.
- The aggregator must not know what any signal *is* — it only consumes `SignalResult[]`.
- Strip `_dev` annotations from claims before they reach the model; they are for testing/demo only, never sent as input.
- Whole-number Risk Score in the UI. Label it "Risk Score," never "Fraud Probability."
