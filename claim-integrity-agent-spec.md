# Claim-Integrity Agent — Hackathon Spec

*Sea x OpenAI Regional Codex Hackathon, Singapore — 6 June 2026 (8:30am–9pm)*
*Build direction: AI-Native Products & Operations (Direction 2)*

> **This is a human planning reference.** The authoritative build context for Codex is `AGENTS.md`
> (read every task) plus the master prompt (`codex-master-prompt.md`). If anything here ever drifts
> from those, those win.

---

## TL;DR

A vision-language reasoning agent that triages Shopee-style refund claims for integrity, with
physical-plausibility reasoning as its core differentiator. Output is a **0–100 Risk Score** plus a
band (Low / Elevated / High) mapped to actions, with a plain-language explanation, surfaced to a
human reviewer — not an auto-reject. Designed to counter the rising scam of AI-generated fake damage
photos by reasoning about the *whole claim*, not just pixel forensics.

---

## The Problem

Refund abuse via AI-generated damage photos has moved from anecdote to industry-scale threat:

- Pindrop estimates roughly three in ten retail fraud attempts are now AI-generated.
- PYMNTS documented (March 2026) a wave of shoppers submitting AI-generated images of damaged
  products to claim refunds on goods received intact.
- The National Retail Federation puts fraudulent returns at ~9% of all returns — over $100B/year.
- High-quality AI fakes evade human reviewers a large fraction of the time.

Shopee's public dispute process is manual human investigation with a ~3-day review SLA. There is no
public AI-native adjudication of damage-photo claims. Incumbent tooling (Riskified, Ravelin) is
Shopify/Amazon-centric; SEA marketplaces are underserved. That's the gap: AI-native triage, tuned to
the AI-photo-fraud vector, as a transparent layer at the front of the existing pipeline.

---

## What We're Building / NOT Building

**Building:** a claim-integrity agent that ingests a refund claim and produces a Risk Score + band +
explanation. Three signals combine via a reliability-weighted score with hard-flag overrides.

**Core bet:** physical-plausibility reasoning. A VLM that understands real glass shatters violently
but coherently, real metal dents and scuffs rather than fracturing radially, real cotton tears along
the weave. This catches photorealistic AI fakes that pixel-level detectors miss.

**Why AI-native:** the core artifact is a judgment under ambiguity over heterogeneous evidence.
Remove the model and you have a form.

**NOT building** (explicit anti-scope):
- ❌ A bespoke AI-image detector (arms race; 10h can't train one).
- ❌ EXIF / metadata / C2PA-provenance signal (stripped in the real world; no story value).
- ❌ Auto-deny logic (false positives punish real customers; this is triage).
- ❌ A real database, auth, or deployment infra (in-memory JSON, localhost demo).
- ❌ A buyer/seller-facing UI (one reviewer-facing screen).
- ❌ Real Shopee integration (standalone demo).

---

## The Pipeline

Every signal implements the same interface and is scored over an enriched claim:

```ts
interface Signal {
  name: string;
  evaluate(claim: EnrichedClaim): Promise<SignalResult>; // EnrichedClaim = claim + account + product + order
}

interface SignalResult {
  name: string;
  risk: number;        // 0..1
  confidence: number;  // 0..1
  evidence: string;    // human-readable
  raw?: unknown;       // for hard-flag checks
}
```

Run signals with `Promise.allSettled(...)` — a signal that throws is **dropped, not fatal**. The
aggregator scores over whatever succeeded. (Do not use `Promise.all`: one failed OpenAI call would
sink the whole claim, which defeats the "score over available signals" design.)

### Signal 1: Visual Claim Integrity *(the star signal)*
One OpenAI vision call. System prompt loaded from `signal-1-prompt.md` (tuned by hand). Inputs:
claim image(s), product material + failure modes, claim text, reason category. Strict-JSON output
(`physical_plausibility`, `confidence`, `plausibility_reasoning`, `contradictions`,
`alternative_explanations`, `text_image_match`, `mismatches`). See `signal-1-tuning-notes.md` for the
schema and the output→risk mapping. Hard-flag: `implausible` AND `confidence > 0.85` → High.

### Signal 2: Image Reuse
`sharp` + `imghash` (64-bit pHash). At startup, hash every claim image (tagged `claim:<id>`) and every
product `reference_image` (tagged `reference:<productId>`). For a claim, find min Hamming distance to
(a) other claims' images and (b) the product's reference photo. `< 5` → hard flag (reuse or doctored
listing photo); `5–8` → elevated; `> 8` → clean. Catches the reuse pair AND doctored-from-listing
fakes.

### Signal 3: Behavioural Context *(deterministic, no ML)*
Over `accounts.json` / `orders.json`:
- `refund_rate > 0.5` → +0.4
- `claims_last_30_days >= 3` → +0.4
- `account_age_days < 30` AND `price_sgd >= 50` → +0.2
- **Logistics-incident override:** if `order.total_claims_against_order >= 3`, treat the cluster as a
  transit incident and pull risk down to `min(risk, 0.2)`. Confidence 0.7. Evidence lists which rules fired.

> ✅ **Logistics-override demo coverage.** The canonical 9-case set triggers this override: claims
> C006/C007/C008 (glass frame, USB hub, monitor) all share order ORD-1006 against account A006, whose
> `claims_last_30_days: 3` would otherwise read risky — so the override pulls the cluster to Low. This
> is the headline example from the Q1 answer, now demoable live.

---

## Scoring & Aggregation

Weighted, confidence-scaled average over **available signals only**:

```
score = Σ(weight · risk · confidence) / Σ(weight · confidence)
```
Weights: Visual **1.0**, Image Reuse **0.9**, Behavioural **0.7**. Missing signals drop from *both*
sums — absence is never treated as risk. Then `riskScore = round(score · 100)`. Hard flags force the
score to at least 75 (into High).

| Score | Band | Default action |
|-------|------|----------------|
| < 30  | **Low** | Release for standard processing (human spot-check) |
| 30–65 | **Elevated** | Route to a human reviewer with the explanation card |
| > 65  | **High** | Escalate / require additional evidence / fraud review |

- **Whole numbers only** — no false precision; you have no labelled data.
- **Label it "Risk Score," not "Fraud Probability."** It's a triage ordinal, not a calibrated probability.

**Final call (OpenAI)** turns (score, band, signal evidences) into a 2–3 sentence reviewer explanation +
recommended action. The math owns the number; the model owns the prose; it must only cite signals that
actually fired and never invent facts.

---

## Architecture & Stack

```
React + Vite + Tailwind  ->  Node + TS + Express  ->  OpenAI  (vision: Signal 1)
(claim list, verdict card)   (signal runner,            OpenAI   (narrator) text
                              aggregator, narrator)      call, same SDK
                                                         in-memory JSON: data/*.json + pHash index
```

- **Models:** OpenAI for the Signal 1 vision call; OpenAI text for the narrator. One `openai` client,
  two model ids read from env (`OPENAI_VISION_MODEL` / `OPENAI_NARRATOR_MODEL`, auth `OPENAI_API_KEY`).
  Wrap the narrator with a templated fallback — it's the flakiest call and the score doesn't depend on it.

- **Data:** `data/products.json`, `data/accounts.json`, `data/orders.json`, `data/claims.json`;
  images in `data/images/claims/` and `data/images/reference/`. No DB.
- **API contract (locked):** `POST /api/claim/:id/score` → full `ScoredClaim`; `GET /api/claims` →
  summaries for the list. Strip `_dev` from every response.
- **Build tool:** Vite; OpenAI Codex for scaffolding and bulk implementation.

---

## Final Demo Scenarios (9)

| Claim | Product | Type | Role | Expected band |
|-------|---------|------|------|---------------|
| C001 | Oxford shirt | **real** seam tear | legitimate apparel; clean account | **Low** |
| C002 | helmet visor | suspicious | plausible scratch, but new-account behaviour raises it | Elevated |
| C003 + C004 | skincare jar | reused image, two accounts | image-reuse hard flag | High |
| C005 | ceramic mug | text-image mismatch | claim says bottom crack, image shows side; risky account | High |
| C006 | glass photo frame | **real** shattered glass | logistics cluster + false-positive trap | **Low** |
| C007 | USB hub | **real** transit damage | logistics cluster | **Low** |
| C008 | monitor | **real** cracked LCD | logistics cluster | **Low** |
| C009 | SSL 2 audio interface | AI-doctored | clear fraud — radial cracks impossible in metal; doctored from listing | High |

Accounts: A001 (clean, files C001), A002 (new account, C002), A003 + A004 (reuse-ring, C003/C004),
A005 (risky, files C005 + C009), A006 (clean long-stander, files the C006/C007/C008 logistics cluster).
Image filenames per `data/IMAGES_MANIFEST.md` — neutral names; ground truth lives only in `_dev`.
The full locked set is `data/CANONICAL_DATASET.md`.

---

## Demo Narrative (90 seconds)

1. (10s) **Hook:** "AI is being used to attack the refund system — buyers submit AI-generated photos
   of damage that doesn't exist. We use AI to defend it."
2. (20s) **Clear fraud (C009):** the SSL 2 with cracks fanning across the metal faceplate. High band;
   the reasoning quotes the physics — metal dents and scuffs, it doesn't fracture radially.
3. (20s) **Image reuse (C003/C004):** the same skincare-jar photo across two accounts. Hard flag fires.
4. (20s) **Logistics override (C006/C007/C008):** an account with three recent claims looks like a
   serial returner — but all three share one order and delivery date. The override reads it as a transit
   incident and pulls the cluster to Low. "Route to logistics, not fraud."
5. (15s) **False-positive trap (C006):** that shattered glass is genuinely real — looks alarming, lands
   **Low**. "Calibrated, not trigger-happy."

Takeaway slide: "What takes ~3 days to investigate, our agent triages in ~5 seconds — for a human to confirm."

---

## 4-Person Delegation

Four people should buy **depth and polish, not more features.** Resist a fourth signal.

| Person | Owns |
|--------|------|
| **A — Prompt / Integration** | Signal 1 prompt + schema + tuning (highest-value, least-delegable), then floating integrator once the prompt locks. |
| **B — Backend** | Scaffold first (unblocks everyone), then Signals 2 & 3, aggregator, narrator, API. De-risked by the master prompt's staged build. |
| **C — Frontend** | React claim list + verdict card + action buttons. Design taste. |
| **D — PM / Demo** | Images + data integration, demo order + narrative, pitch deck, cross-stream QA, demo delivery. A real job, not overhead. |

Sequencing: B scaffolds hr 0–1; A tunes Signal 1 hr 1–4 on the 6 scenarios; C builds against the locked
API shape; D wires images/data and drives integration from hr 4. **Lock the API contract hour 1.**
**No unverified Codex output to main.** **Rehearse on the demo machine.**

**Cut list if behind at hr 6:** first the behavioural override (keep the simple heuristic), then mock
the image-reuse hard flag for C003/C004. **Never cut:** Signal 1, the verdict card, the C005/C006
false-positive trap, the rehearsal.

---

## Risks & Honest Limits

- **No labelled data → no calibration.** It's a triage heuristic, not a probability. Pitch it as a ranker.
- **VLMs can be confidently wrong about physics.** Mitigated by step-by-step reasoning + conservative
  confidence thresholds, not eliminated.
- **Adversarial drift.** Frame as raising the cost of attack, not eliminating fraud.
- **False positives have real cost** → human-in-the-loop, never auto-deny.
- **Incumbent shadow.** Sea/Shopee likely has internal fraud ML. Our novelty is the physical-plausibility
  *reasoning* + *explainability for reviewers* and the cross-platform reuse view — not "AI does fraud."

---

## Application Answers (as submitted — preserved for the record)

### Q1 — "What do you want to build? Be specific." (~485 words)

> We're building a real-time refund-claim integrity system for Shopee. Refund abuse via AI-generated
> damage photos has moved from anecdote to industry-scale threat — Pindrop estimates roughly three in
> ten retail fraud attempts are now AI-generated, PYMNTS documented a wave of these claims in March
> 2026, and the National Retail Federation puts fraudulent returns at over $100 billion a year.
> Shopee's current public process is manual investigation with a ~3-day review SLA; there is no
> AI-native adjudication layer for damage-photo claims today.
>
> We're *not* building an AI-image detector — that's a pixel-forensics arms race detectors lose,
> especially against edited photos and re-compressed uploads. We adjudicate the *whole claim* by
> scoring three signals into one Risk Score:
>
> 1. **Visual Claim Integrity** — a vision-language model reasons about whether the visible damage is
>    physically plausible for the product and material (real metal dents rather than fracturing
>    radially; real cotton tears along the weave), and whether the image actually matches the buyer's
>    written complaint. This physical-plausibility reasoning is the project's technical core and
>    catches photorealistic fakes that pixel forensics miss.
> 2. **Image Reuse** — perceptual hashing across every claim image on the platform, detecting when the
>    same or near-identical photo appears across multiple accounts or sellers.
> 3. **Behavioural Context** — refund patterns evaluated against order context, product category, and
>    delivery history rather than raw refund rate alone, so a cluster of refunds tied to one shipment
>    reads as a logistics incident, not as fraud.
>
> Each signal produces a 0–1 score with a confidence weight; a reliability-weighted formula combines
> them into a single 0–100 Risk Score, categorised into Low (<30, release for standard processing),
> Elevated (30–65, route to a human reviewer), or High (>65, escalate or require additional evidence) —
> with hard-flag overrides for smoking guns (near-duplicate images, high-confidence implausibility)
> that route directly to High.
>
> A final language-model pass writes a plain-English explanation of every flagged signal so reviewers
> see precisely why a claim was scored as it was — e.g. *"High refund rate detected, but 8 of 10 claims
> share the same order ID and delivery date. Likely a logistics incident. Recommend: route to
> logistics, not fraud."*
>
> The output isn't an auto-reject — it's a ranked, explained triage layer for human reviewers, turning
> a multi-day investigation into a five-second pre-screen.
>
> Two things make this defensible. **Technically**, the physical-plausibility reasoning is hard to
> commoditise — it's domain reasoning, not pattern matching. **Structurally**, individual sellers only
> see their own claims; only Shopee sees across the platform — and only Shopee can detect a buyer
> submitting recycled damage photos to fifteen different sellers across fifteen different shops. That
> cross-platform visibility is the moat, and the Risk Score is how we make it concrete and actionable.
>
> We'll demo it live on a seeded dataset of fraudulent, legitimate, and deliberately ambiguous claims —
> including a false-positive trap (real damage that looks suspicious) to show the system is calibrated,
> not trigger-happy.

### Q2 — "Something you've built that you're proud of." (~100 words — fact-check before use)

> I built a dropship detection tool for buyers on Shopee and Carousell in Southeast Asia. You paste a
> product link and it returns a letter-grade score plus a percentage, telling you how likely the
> listing is reselling AliExpress wholesale stock at a large markup rather than genuine retail.
>
> A five-signal pipeline scores the listing across image-match, pricing, seller, and metadata signals —
> comparing against AliExpress catalogue data for the electronics category — then combines them into a
> hybrid percentage + letter grade, granular enough to compare listings and simple enough for an
> at-a-glance verdict. React frontend, Node/Express backend.

*Before submitting Q2: swap in your actual five signal names, and consider one line on why it fills a
gap (existing dropship tools target US/EU patterns, not SEA pricing).*

---

## Open Questions

- **Model strings:** verify the current OpenAI vision model AND the OpenAI narrator (text) model at the
  venue; read both from env vars, don't hardcode guesses.
- **OpenAI rate limit:** confirm your tier's request/token limits won't bite during repeated eval runs
  or the live demo; the narrator's templated fallback covers a transient failure.
- **Logistics override demo:** add a 7th scenario, or present it as a capability? (See the gap note above.)
- **Image format:** confirm all images are JPG (~1024px) and filenames match the JSON exactly.
- **Pitch video:** recording a 90-second backup, or live-demo only? (Affects hour 8–9 budget.)
