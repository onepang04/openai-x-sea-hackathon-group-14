# Codex Master Build Prompt — Claim-Integrity Agent

> **How to use this:** open the repo root in VS Code with Codex, make sure `AGENTS.md`,
> `data/*.json`, the `data/images/` folders, and `signal-1-prompt.md` are present, then paste
> this whole file as your first message. Codex will build in **stages and STOP after each one**
> for you to review + commit. Do **not** tell it to skip the stops. Drive it stage by stage.

---

## Mission

Build a **refund-claim integrity triage tool** for a marketplace (Shopee context). Given a refund
claim — claim text, reason category, buyer-uploaded image(s), plus account/order/product context —
it produces a **0–100 Risk Score**, a **band** (Low / Elevated / High), a per-signal breakdown, and a
short plain-English explanation written for a **human reviewer**.

It is a **triage aid, not a judge.** It never auto-approves or auto-rejects. A human makes the call.

### What this is NOT — do not build these
- **Not an AI-image detector.** Do not import, train, or call any "is this image AI-generated" model.
  The visual signal reasons about *physical plausibility* (does this failure make sense for this
  material?), not image provenance. Detectors are an arms race we deliberately avoid.
- No database, no auth, no login, no user management. **JSON files on disk are the only data store.**
- No payment, no real Shopee API. Everything runs against the local mock data.

---

## Architecture

A small monorepo:

```
/AGENTS.md                 # context (already present)
/signal-1-prompt.md        # the vision system prompt (present)
/data/                     # products.json, accounts.json, orders.json, claims.json (present)
/data/images/claims/       # buyer-uploaded claim photos (present)
/data/images/reference/    # pristine listing photos (present)
/apps/api/                 # Node + TypeScript + Express backend  ← build this
/apps/web/                 # React + Vite reviewer UI             ← build this
```

Pipeline: **load a claim → enrich it (join account/order/product) → run 3 signals in parallel →
aggregate into a Risk Score + band → narrate an explanation → return a `ScoredClaim`.**

---

## Data contracts — build to these EXACT TypeScript types

Put these in `apps/api/src/types.ts`. Everything else consumes them. Do not change the shapes.

```ts
export type ReasonCategory =
  | "damaged_or_faulty" | "wrong_product" | "incomplete"
  | "not_as_described" | "did_not_receive";

export interface Product {
  id: string; name: string; category: string; material: string;
  typical_failure_modes: string[]; price_sgd: number;
  reference_image?: string; // pristine listing photo filename
}

export interface Account {
  id: string; display_name: string; account_age_days: number;
  total_orders: number; total_refunds: number; claims_last_30_days: number;
  profile_note?: string;
}

export interface Order {
  id: string; account_id: string; delivery_date: string;
  items: number; total_claims_against_order: number; note?: string;
}

export interface Claim {
  id: string; account_id: string; product_id: string; order_id: string;
  reason_category: ReasonCategory; claim_text: string; images: string[];
  _dev?: { scenario_role: string; ground_truth: "legitimate" | "fraudulent";
           expected_band: string; why: string };
}

export interface EnrichedClaim { claim: Claim; account: Account; product: Product; order: Order }

export interface SignalResult {
  name: string; risk: number; confidence: number; // both 0..1
  evidence: string; raw?: unknown;
}

export type Band = "Low" | "Elevated" | "High";

export interface ScoredClaim {
  claimId: string; riskScore: number; // 0..100 whole number
  band: Band; hardFlag: string | null;
  signals: SignalResult[]; explanation?: string; recommendedAction?: string;
}
```

**Critical:** the `_dev` block on each claim is demo ground-truth. **Strip it before anything
reaches any model.** It must never appear in a prompt sent to the LLM.

Every signal implements one interface:

```ts
export interface Signal {
  name: string;
  evaluate(claim: EnrichedClaim): Promise<SignalResult>;
}
```

The aggregator only ever sees `SignalResult[]` — it never knows what a signal *is*. This means we
can add or drop a signal without touching scoring.

---

## The three signals

### 1. Visual Claim Integrity (`name: "Visual Claim Integrity"`) — the core signal
One OpenAI **vision** call. Inputs: the claim image(s), the product `material`, its
`typical_failure_modes`, the `claim_text`, and the `reason_category`. The system prompt lives in
`signal-1-prompt.md` (repo root) — **load it from disk, do not inline a guess.** It must return **strict JSON**:

```json
{ "physical_plausibility": "plausible" | "implausible" | "uncertain",
  "confidence": 0.0,
  "reasoning": "one or two sentences",
  "contradictions": ["..."],
  "alternative_explanations": ["..."] }
```

Map to `SignalResult`: `risk` = plausible→~0.1, uncertain→~0.5, implausible→~0.9;
`confidence` = the model's `confidence`; `evidence` = `reasoning`; `raw` = the full parsed JSON
(the aggregator reads `physical_plausibility` and `confidence` from it).

### 2. Image Reuse (`name: "Image Reuse"`) — perceptual hashing
Use `imghash` + `sharp`. At startup, build an index of perceptual hashes over **every claim image**
(tagged `claim:<id>`) **and every product `reference_image`** (tagged `reference:<productId>`).
For the claim under evaluation, hash its image(s) and find the minimum Hamming distance to:
(a) **other claims'** images (catches one photo reused across accounts), and
(b) **this product's reference photo** (catches a doctored listing image).
Thresholds (tune against the real images): `distance <= 5` → **hard flag** (`raw.hardFlag = true`);
`<= 8` → elevated suspicion; otherwise low. `risk` scales inversely with distance; `confidence`
is high when any match is found. `evidence` names what matched and the distance.

### 3. Behavioural Context (`name: "Behavioural Context"`) — deterministic, no API
Hand-tuned heuristics (be honest in the pitch that these are rules, not learned):
- refund rate (`total_refunds / total_orders`) > 0.5 → +0.4
- `claims_last_30_days >= 3` → +0.4
- `account_age_days < 30` AND `product.price_sgd >= 50` → +0.2
- **Logistics-incident override:** if `order.total_claims_against_order >= 3`, the cluster reads as
  a parcel-level transit incident, not per-item fraud — **pull risk down** to `min(risk, 0.2)` and
  say so in the evidence. This override LOWERS risk; it is a deliberate false-positive guard.
- Clamp to [0,1]; `confidence` = 0.7; `raw` = `{ refundRate, isLogisticsCluster }`.

Run all three with `Promise.allSettled` — **a signal that throws is dropped, not fatal.** The
aggregator simply scores over whatever succeeded.

---

## Aggregation + banding — exact math

```
weights: Visual 1.0, Image Reuse 0.9, Behavioural 0.7  (unknown signal → 0.5)
score01 = Σ(weight · risk · confidence) / Σ(weight · confidence)   over AVAILABLE signals
riskScore = round(score01 · 100)

hardFlag fires if:  Image Reuse raw.hardFlag === true
                OR  Visual physical_plausibility === "implausible" AND confidence > 0.85
if hardFlag: riskScore = max(riskScore, 75)   // force into High band

bands:  < 30 → Low,  30–65 → Elevated,  > 65 → High
```

A missing signal drops out of **both** the numerator and denominator — it doesn't dilute the score
toward zero. Confidence-weighting means an unsure signal contributes less.

`recommendedAction` (advisory string only): Low → "Auto-approve eligible (human spot-check)";
Elevated → "Route to manual review"; High → "Hold for investigation".

---

## The narrator — final call, on OpenAI
After aggregation, one text-only call turns the `ScoredClaim` into a 2–4 sentence explanation for a
reviewer. **Use OpenAI**: reuse the same `openai` SDK and `OPENAI_API_KEY`, with a text model id from
`OPENAI_NARRATOR_MODEL` (may differ from the vision model — a cheaper text model is fine).
It must **only** reference the signals that actually drove the score, name the band, and never invent
facts not in the signal evidence. Write the result into `explanation`.

**Resilience (required):** put the narrator behind a small interface and wrap the call in
try/catch with a fallback (a templated string built from the signal evidence)
if it errors, times out, or rate-limits. The Risk Score and band do NOT depend on the narrator, so a
narrator hiccup must never break a claim — it just swaps the prose.

---

## The reviewer UI (`apps/web`, React + Vite)
One screen, built to be readable across a room during a live demo:
- **Left:** list of all claims (id + product + a band-coloured dot). Click to select.
- **Right — the verdict card** for the selected claim:
  - Large **Risk Score** number + band, colour-coded (Low green / Elevated amber / High red).
  - The **claim image** and, if present, the product **reference image** side by side.
  - **Per-signal breakdown**: three rows, each showing signal name, its risk/confidence, and the
    one-line `evidence`. Make the hard-flag visually obvious when set.
  - The **narrator explanation** in plain prose.
  - **Action buttons** (Approve / Escalate / Reject) — these are **UI-only and human-driven**; the
    system never auto-acts. A click just logs the human decision locally.

Clean, fast, uncluttered, high contrast. No component libraries needed beyond what Vite gives you;
if you reach for one, keep it light.

---

## Eval harness — your regression net
A script (`apps/api/src/scripts/runEval.ts`, runnable via an npm script) that loads all claims,
runs the full pipeline, and prints a table of **claimId · expected band (from `_dev.expected_band`)
· actual band · PASS/FAIL**. Add a `--no-vision` flag that skips the OpenAI vision signal so you can
test the deterministic spine without burning API calls. **Run this after every change.**

The 6 demo claims and their expected outcomes:
| Claim | Product | Expected band |
|-------|---------|---------------|
| C001 | SSL 2 interface (impossible metal cracks) | High |
| C002 | Oxford shirt (doctored listing photo) | Elevated or High |
| C003 / C004 | backpack (same image, two accounts) | High |
| C005 | photo frame (real shattered glass) | **Low** |
| C006 | Calcifer tray (real breakage) | **Low** |

The two legit cases (C005, C006) landing **Low** is the make-or-break demo moment — treat any
regression there as a build-breaker.

---

## BUILD SEQUENCE — stop and wait for review after EACH stage

> After each stage: summarise what you changed, then **STOP**. I will review, commit, and tell you
> to proceed. Do not start the next stage on your own.

**Stage 0 — Scaffold.** Create the `apps/api` (Node + TypeScript + Express) and `apps/web`
(React + Vite) skeletons, `tsconfig`s, and `package.json`s. Add deps: api → `express`, `cors`,
`openai`, `imghash`, `sharp`; dev → `typescript`, `tsx`, `@types/*`. Confirm both apps start. STOP.

**Stage 1 — Types + data layer.** Add `types.ts` exactly as specified. Write a loader that reads the
four JSON files and a function that joins a claim into an `EnrichedClaim`. Add a throwaway script
that prints all enriched claims so we can eyeball that joins resolve. STOP.

**Stage 2 — Deterministic spine (NO API yet).** Implement the `Signal` interface, the Behavioural
Context signal, the Image Reuse signal (build the hash index at startup), the aggregator + banding +
hard-flag, and the eval harness with `--no-vision`. Run `runEval --no-vision` and report the table.
This proves the scoring math against C003/C004 (reuse) and the behavioural cases without spending a
token. STOP.

**Stage 3 — Vision + narrator.** Implement the OpenAI client (one client, used for both the vision
call and the text narrator call), the Visual Claim Integrity signal
(loading `signal-1-prompt.md`, strict-JSON parse with a safe fallback), and the narrator with its
fallback. Wire
both into the pipeline. Run the **full** eval and report expected vs actual for all 6 claims. STOP.

**Stage 4 — API.** Express endpoints matching the **locked contract**: `POST /api/claim/:id/score`
(runs the pipeline for that claim and returns the full `ScoredClaim`) plus `GET /api/claims` (claim
summaries for the list view). Strip `_dev` from every response. STOP.

**Stage 5 — Reviewer UI.** Build the verdict card screen against the API. STOP.

**Stage 6 — Polish + demo.** Tighten styling, make the hard-flag and the two legit "Low" cases read
clearly, and confirm the eval is still green. STOP.

---

## Hard rules (do not violate, at any stage)
1. **No AI-image-detection** of any kind. Physical-plausibility reasoning only.
2. **No DB / auth / accounts.** JSON files only.
3. **Never auto-decide a claim.** `ScoredClaim` and the UI buttons are advisory; a human acts.
4. **Strip `_dev`** before any model call and before any API response.
5. **Verify both model strings at runtime** — read the OpenAI vision and narrator model ids from env
   vars (`OPENAI_VISION_MODEL` / `OPENAI_NARRATOR_MODEL`, auth `OPENAI_API_KEY`); do not hardcode guesses.
6. **Commit after every stage**; keep diffs small and reviewable.
7. If a contract or behaviour is ambiguous, **stop and ask** — do not invent a new data shape.
8. Build to the types above verbatim. If you think a type should change, raise it; don't silently edit.
