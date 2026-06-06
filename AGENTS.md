# AGENTS.md — Claim-Integrity Agent

Context for Codex and teammates. Read this before any task.

## What this project is

A refund-claim integrity system for a Shopee-style marketplace. A Shopee internal reviewer logs in to a dashboard, sees refund claims submitted by buyers, and uses triage output to verify the claims. The system ingests each refund claim (buyer text + photo + product + account context) and produces a **0–100 Risk Score**, a band (Low / Elevated / High), and a plain-English explanation for the reviewer. Hackathon demo, not production.

## Architecture

```
React frontend  ->  Node/TS backend  ->  OpenAI (vision: Signal 1)
(reviewer login,    (demo login,          OpenAI (narrator:
 internal dashboard, signal runner,        reviewer explanation)
 verdict card)       aggregator,
                     LLM narrator)
                          |
                  in-memory JSON data
                  (claims/accounts/products/orders + pHash index)
```

## Current workflow

1. Shopee internal reviewer signs in with a demo reviewer login.
2. Reviewer lands on the internal claim dashboard.
3. Claims are assumed to arrive from Shopee/platform data via webhook; for the demo, the seeded JSON files stand in for webhook-fed records.
4. Reviewer reviews buyer refund claims using Risk Score, Risk Band, signal evidence, and explanation.
5. Reviewer records an advisory action locally. The system never auto-approves or auto-rejects.

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
A final **OpenAI** text call turns (score, band, evidences) into the reviewer-facing explanation + recommended action.

## Tech stack (do not substitute)

- Backend: Node + TypeScript + Express, `openai`, `sharp`, `imghash`.
- Models: one OpenAI client via the `openai` SDK — a vision model for the Signal 1 call (`OPENAI_VISION_MODEL`) and a text model for the narrator (`OPENAI_NARRATOR_MODEL`), both authenticated with `OPENAI_API_KEY`.
- Frontend: React + TypeScript + Tailwind, built with Vite. Includes demo reviewer login plus the Shopee internal reviewer dashboard.
- Data: JSON files in `data/`, loaded into memory at startup.

## Hard anti-scope rules (DO NOT)

- ❌ No database, no ORM. JSON in memory only.
- ❌ No production auth or user-management system. Demo reviewer login is in scope.
- ❌ No manual claim input form. Claims are webhook-fed in the product story and seeded from JSON in the demo.
- ❌ No deployment config, Docker, or CI.
- ❌ No new signals beyond the three above.
- ❌ No metadata/EXIF signal, no third-party AI-detector signal.
- ❌ Do not invent scoring fields not present in the JSON schemas unless the data contract is updated in the docs first.

## Conventions

- The demo dataset is LOCKED in `data/CANONICAL_DATASET.md` (18 active claims: C001–C020 excluding C002 and C008, products, expected bands). Build every stream to it; it overrides any older scenario list in the spec.
- The demo reviewer may see all seeded claims unless a separate reviewer assignment map is added deliberately.
- Keep each signal in its own file under `src/signals/`.
- The aggregator must not know what any signal *is* — it only consumes `SignalResult[]`.
- Strip `_dev` annotations from claims before they reach the model; they are for testing/demo only, never sent as input.
- Whole-number Risk Score in the UI. Label it "Risk Score," never "Fraud Probability."
