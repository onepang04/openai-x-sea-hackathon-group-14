# Claim-Integrity Agent — Hackathon Spec

*Sea x OpenAI Regional Codex Hackathon, Singapore — 6 June 2026 (8:30am–9pm)*
*Build direction: AI-Native Products & Operations (Direction 2)*

---

## TL;DR

A vision-language reasoning agent that adjudicates Shopee-style refund claims for integrity, with physical-plausibility reasoning as its core differentiator. Output is a **0–100 Risk Score** plus a band (Low / Elevated / High) mapped to actions, with a plain-language explanation, surfaced to a human reviewer — not an auto-reject. Designed to counter the rising scam of AI-generated fake damage photos by reasoning about the *whole claim*, not just pixel forensics.

---

## The Problem

Refund abuse via AI-generated damage photos has moved from anecdote to industry-scale threat:

- Pindrop estimates roughly three in ten retail fraud attempts are now AI-generated.
- PYMNTS documented (March 2026) a wave of shoppers submitting AI-generated images of damaged products to claim refunds on goods received intact.
- The National Retail Federation puts fraudulent returns at ~9% of all returns — over $100B/year in losses.
- High-quality AI fakes evade human reviewers ~75% of the time.

Shopee's publicly described dispute process is a manual human investigation with a ~3-day SLA for review (plus QC time on physical returns). Shopee has AI in customer service ("Sophie" chatbot) but no public AI-native adjudication of damage-photo claims. Industry tooling (Riskified, Ravelin) is Shopify/Amazon-centric; SEA marketplaces are underserved publicly.

That's the gap: AI-native adjudication, specifically tuned to the new AI-photo-fraud vector, as a transparent triage layer at the front of the existing pipeline.

---

## What We're Building

A claim-integrity agent that ingests a refund claim and produces a fraud-risk band + explanation. Three signals combine via a reliability-weighted score with hard-flag overrides for smoking guns.

**Core bet:** physical-plausibility reasoning. A vision-language model that understands real ceramic doesn't fracture radially from that impact point, real cotton doesn't fray in straight lines, real screen cracks propagate from impact origins. This catches photorealistic AI fakes that pixel-level detectors miss.

**Why it's AI-native (not "AI as add-on"):** the core artifact is a judgment under ambiguity over heterogeneous evidence. Remove the model and you have a form. Pass: the EDM's bar for Direction 2.

**Protagonist:** the platform's trust & safety reviewer. The agent doesn't replace them — it changes their job from "investigate from scratch over 3 days" to "review a ranked, explained queue in minutes."

---

## What We're NOT Building

Explicit anti-scope, so we don't drift:

- ❌ A bespoke AI-image detector (arms race, off-the-shelf APIs are flaky, 10h can't train one).
- ❌ EXIF / metadata signal (~zero real value once platforms strip it; not worth the story).
- ❌ Auto-deny logic (false positives punish real customers; this is triage, not adjudication).
- ❌ A real database, auth, or deployment infrastructure (in-memory JSON, localhost demo).
- ❌ A buyer-facing or seller-facing UI (one reviewer-facing screen).
- ❌ Real Shopee integration (this is a standalone demo, not a plugin).

---

## The Pipeline

Every signal implements the same interface:

```ts
interface Signal {
  name: string;
  evaluate(claim: Claim): Promise<SignalResult>;
}

interface SignalResult {
  name: string;
  risk: number;        // 0..1
  confidence: number;  // 0..1
  evidence: string;    // human-readable reasoning
  raw?: any;           // for debugging / hard-flag checks
}
```

Signals run in parallel: `await Promise.all(signals.map(s => s.evaluate(claim)))`.

### Signal 1: Visual Claim Integrity *(physical plausibility + text-image consistency)*

The star signal. One OpenAI vision call combining two checks.

- **Model:** OpenAI vision model (gpt-4o or current equivalent). Use the smaller variant during dev, the larger for the demo.
- **Inputs:** image(s) (base64 or URL), product type, product material, buyer's claim text, claim reason category.
- **Output (force via `response_format: json_schema`):**
  ```json
  {
    "damage_present": true,
    "physical_plausibility": "plausible | implausible | uncertain",
    "plausibility_reasoning": "...1–2 sentences citing material behavior...",
    "text_image_match": true,
    "mismatches": ["..."],
    "confidence": 0.85
  }
  ```
- **Prompt structure:** force step-by-step reasoning *before* the verdict. Template:
  > "First, list the expected physical failure modes for a [material] [product]. Then evaluate whether the visible damage in the image is consistent with those modes. Then check whether the image content matches the buyer's claim. Finally, output your structured verdict."
- **Mapping to SignalResult:**
  - implausible OR mismatch → risk 0.7–0.95
  - plausible AND match → risk 0.05–0.2
  - uncertain → risk 0.4–0.5, confidence ≤ 0.5
- **Hard-flag trigger:** `physical_plausibility = "implausible"` AND `confidence > 0.85` → force band = High.

### Signal 2: Image Reuse *(internal perceptual-hash dedup)*

Catches fraud rings and copy-pasted "evidence."

- **Libraries:** `sharp` (image processing) + `imghash` (npm, 64-bit pHash).
- **Process:** at startup, pHash every seeded claim image and load into memory. On a new claim, compute pHash → minimum Hamming distance to all stored hashes.
- **Output:** `{ match_found, min_distance, matching_claim_id }`
- **Mapping:**
  - distance < 5 → risk 0.95, confidence 0.95
  - 5–8 → risk 0.5, confidence 0.6
  - \> 8 → risk 0, confidence 1.0 (signal cleanly reports "no reuse")
- **Hard-flag trigger:** distance < 5 → force band = High.

### Signal 3: Behavioural Context *(a.k.a. Account Behavior)*

Pure deterministic logic, no ML. **Naming note:** the pitch calls this "Behavioural Context" (refund patterns relative to order/category/delivery context); the buildable MVP below is the simpler heuristic core. The context-aware logic — especially the shared-order-ID → logistics-incident case — must be explicitly seeded and implemented to back up the pitch's headline example. Don't over-promise beyond what you seed.

- **Source:** `accounts.json` (synthetic dataset, pre-seeded).
- **Computed features:**
  - `refund_rate = refund_count / total_orders`
  - `claims_last_30_days`
  - `account_age_days`
  - `claims_sharing_order_id` (powers the logistics-incident example)
- **Heuristic rules (hand-tuned, document them in code comments):**
  - `refund_rate > 0.5` → +0.4 risk
  - `claims_last_30_days >= 3` → +0.4 risk
  - `account_age_days < 30` AND claim value ≥ $50 → +0.2 risk
  - **Context override:** if a refund cluster shares one order ID + delivery date → *lower* the risk and tag as likely logistics incident (this is the demo's nuance moment).
  - Sum, cap at 1.0.
- **Confidence:** 0.7 (heuristic, not learned — be honest in the pitch).
- **Evidence string:** list which rules triggered.

---

## Scoring & Aggregation

**Weighted score** over available signals only:

```
score = Σ(weight_i · risk_i · confidence_i) / Σ(weight_i · confidence_i)
```

**Base weights** (reliability-based):
- Visual Claim Integrity: **1.0**
- Image Reuse: **0.9**
- Account Behavior: **0.7**

**Critical detail:** missing signals drop out of *both* numerator and denominator. Never treat absence as risk.

**Hard-flag overrides** bypass the average:
- Visual Claim Integrity: `implausible` with `confidence > 0.85` → High
- Image Reuse: distance < 5 → High

**Output = score + band (both layers).** The weighted formula yields a 0–1 value; present it as a **0–100 Risk Score** (the ranking layer) *and* a band (the action layer):

| Score | Band | Default action |
|-------|------|----------------|
| < 30  | **Low** | Release for standard processing |
| 30–65 | **Elevated** | Route to a human reviewer with the explanation card |
| > 65  | **High** | Escalate / require additional evidence / fraud-team review |

Two honest caveats baked into the design:
- **Round to whole numbers** — no "73.4%". Without labelled data you can't justify decimals; false precision invites the "why 73 not 71?" question.
- **Label it "Risk Score," not "Fraud Probability."** It's a triage ordinal for reviewer prioritisation, not a calibrated probability. The label must support that answer.

**Final LLM call** for the reviewer narrative. Input: score, band, all signal evidences, claim context. Output: a 2–3 sentence plain-language explanation + a recommended action ("Approve refund," "Flag for manual review," "Request additional evidence"). The math owns the number; the model owns the prose.

---

## Architecture & Stack

```
+--------------------+        +--------------------+        +-------------------+
|  React frontend    | -----> |  Node/TS backend   | -----> |  OpenAI API       |
|  - claim list      |        |  - signal runner   |        |  - vision model   |
|  - verdict card    | <----- |  - aggregator      | <----- |  - explanation    |
+--------------------+        |  - LLM narrator    |        +-------------------+
                              +--------------------+
                                       |
                              +--------------------+
                              |  In-memory data    |
                              |  - claims.json     |
                              |  - accounts.json   |
                              |  - products.json   |
                              |  - pHash index     |
                              +--------------------+
```

- **Backend:** Node + TypeScript + Express (or Fastify). `openai` SDK, `sharp`, `imghash`.
- **Frontend:** React + Tailwind. Two screens: claim list (with band badges), verdict detail (per-signal breakdown + LLM explanation + approve/override buttons).
- **Data:** JSON files in repo + `images/` folder. No DB.
- **Deploy:** localhost for demo; Vercel/Render only if a public URL is wanted.
- **Build tool:** Vite. Use OpenAI Codex (the hackathon's expected dev tool) for scaffolding and bulk implementation.

---

## Pre-Hackathon Work (before 6 June)

The hackathon day is for *building*. Everything below must be done in advance. Items marked ✅ are already produced (in `mock-data/`, `AGENTS.md`, `signal-1-prompt.md`); the rest are on the team.

### A. Data (mostly done)
- ✅ `products.json` — 5 products with material + failure modes.
- ✅ `accounts.json` — 6 accounts incl. the logistics-incident account (A005).
- ✅ `orders.json` — order metadata incl. ORD-9981 (8 claims, one delivery date).
- ✅ `claims.json` — 8 annotated scenarios (clear legit, clear fraud, image-reuse pair, ambiguous demo-winner, false-positive trap, logistics incident ×2).
- ⬜ **Images** — source/generate the 7 images per `IMAGES_MANIFEST.md`. This is the main outstanding data task. Owner: Demo/Data lead.

### B. Environment & tooling (team)
- ⬜ Repo created, Node/TS + Vite + Express toolchain installed and booting.
- ⬜ OpenAI API key in place and a single vision call verified end-to-end.
- ⬜ `sharp` + `imghash` installed and pHash verified on two sample images.
- ⬜ Codex installed; **everyone runs it once** on a throwaway task to learn the loop.

### C. Context & prompt (mostly done)
- ✅ `AGENTS.md` — drop in repo root so Codex reads it every task.
- ✅ `signal-1-prompt.md` — starting prompt + schema (now with `contradictions` / `alternative_explanations` reasoning fields). **Not final** — must be tuned on the day.
- ⬜ Define the API contract (`POST /api/claim/:id/score` → response shape) and share it so backend and frontend don't diverge. Owner: Backend lead.
- ⬜ **Eval scripts are first-class, not afterthoughts.** `eval:signal1` and `eval:pipeline` get built in Phases 1–2 so you have a truth loop from minute one (see the build-plan runbook). They read the `_dev` expected bands in `claims.json`.

> **Pre-build note:** building these assets ahead of time is fine for this team because you'll transfer into a fresh repo on the day. Keep the prep portable (briefs + JSON + prompts) so the clean re-commit is trivial.

### Traps to avoid
- **"Teaching to the test."** The AI fakes — especially `C005` — must be genuinely hard, not easy for your own prompt.
- **Internal inconsistency.** Material must match claimed damage; claim dates after order dates. (The provided JSON is already consistent — keep it that way if you add scenarios.)

---

## 4-Person Delegation

A project this size could be done by two strong people. With four, the extra capacity should buy **depth and polish, not more features.** Resist adding a fourth signal because you have spare hands — that's how teams blow the demo. Use the surplus for: a sharper pitch, a recorded backup demo video, more robust scenario handling, and a dedicated integrator.

### Roles

| Person | Owns | Codex usage |
|--------|------|-------------|
| **A — ML / Prompt lead** | Signal 1 (the VLM prompt + schema + tuning). The highest-value, least-delegable stream. | Light — Codex writes the wrapper; A tunes the prompt by hand. |
| **B — Backend / pipeline lead** | Scaffold (first, unblocks everyone), then Signals 2 & 3, aggregator, scoring, narration call, API. | Heavy — Codex does most of this. |
| **C — Frontend lead** | React UI: claim list + verdict card + approve/override. Design taste. | Heavy — Codex builds from the viz spec; C directs look. |
| **D — Data / Demo / Integration lead** | Images + mock-data integration, demo scenarios + narrative, pitch deck, and cross-stream QA/integration. | Medium — wires things together, catches integration bugs. |

### Dependency-aware sequencing

```
Hr 0–1   B scaffolds the repo (everyone else preps their lane).
         A starts the Signal-1 prompt with a standalone test script (no app needed).
         C sketches the UI against a MOCKED score response.
         D finalises image drop-in + verifies all JSON loads.

Hr 1–4   A: tune Signal 1 against all 8 scenarios (the critical path).
         B: Signals 2 & 3 + aggregator + hard-flags + narration.
         C: build claim list + verdict card against the agreed API shape.
         D: assemble demo order, draft pitch, start integration as pieces land.

Hr 4–6   B + A: plug real Signal 1 into the pipeline; D integrates frontend↔backend.
         C: polish verdict card (the screenshot moment).

Hr 6–8   D leads integration + end-to-end test across all 8 scenarios.
         A/B/C fix what D's testing surfaces.

Hr 8–9   D + C: demo polish. A/B on standby for targeted fixes only.

Hr 9–10  Whole team: rehearse the 90-second demo (D drives), record a backup video, buffer.
```

### Coordination rules (4 people = integration risk)
- **Lock the API contract by hour 1.** B publishes the `SignalResult` and `/score` response shapes; C and A build to them.
- **D owns the "does it actually run end-to-end" question** from hour 4 onward — nobody else's job, or it falls through the cracks.
- **No one merges unverified Codex output to main.** Same rule as solo, more important with four.
- **One demo machine.** Rehearse on the exact machine/network you'll present on.

### Ruthless cut list if behind at hour 6
1. First: Behavioural context override (keep the simple heuristic; hardcode the logistics tag for C007/C008).
2. Then: Image reuse (mock the hard-flag result for C003/C004).
3. **Never cut:** Signal 1, the verdict card, the false-positive trap, the rehearsal.

---

## Demo Narrative (90 seconds)

1. (10s) **Hook:** "AI is being used to attack the refund system — buyers submit AI-generated photos of damage that doesn't exist. We use AI to defend it."
2. (20s) **Scenario 1, clear fraud:** show an AI-generated "cracked ceramic mug" with impossible radial fracture. Verdict card shows High band, plausibility reasoning quotes the physics ("ceramic fractures along stress lines, not radially from this impact angle").
3. (20s) **Scenario 2, image reuse:** same fake photo appears in another claim. Hard-flag fires, narrative explains.
4. (25s) **Scenario 3, the ambiguous case:** plausible-looking fake. Visual integrity is borderline (Elevated), but account behavior shows serial-returner pattern. Combined score = High. Reviewer sees one paragraph: "Approve with caution / request additional angle photos because…"
5. (15s) **Scenario 4, the false-positive trap:** real damage that looks weird. System lands on Low/Elevated, not High. "It's calibrated, not trigger-happy."

The takeaway slide: "What Shopee currently takes 3 days to investigate, our agent triages in 5 seconds — for a human to confirm."

---

## Risks & Honest Limits

Things to acknowledge to judges before they ask:

- **No labeled data → no calibration.** This is a triage *heuristic*, not a probability. Pitched honestly as a ranker for reviewer attention.
- **VLMs can be confidently wrong about physics.** Mitigated by step-by-step reasoning and conservative confidence thresholds, but not eliminated.
- **Adversarial drift.** Anything we build, scammers adapt to. Frame as raising the cost of attack, not eliminating fraud.
- **False positives have real cost.** Therefore: human-in-the-loop, never auto-deny.
- **Incumbent shadow.** Sea/Shopee likely has internal fraud ML. Our novelty is the *physical-plausibility reasoning* and *explainability for reviewers* — not "AI does fraud."

---

## Application Answers

### Q1 — "What do you want to build? Be specific." (~485 words)

> We're building a real-time refund-claim integrity system for Shopee. Refund abuse via AI-generated damage photos has moved from anecdote to industry-scale threat — Pindrop estimates roughly three in ten retail fraud attempts are now AI-generated, PYMNTS documented a wave of these claims in March 2026, and the National Retail Federation puts fraudulent returns at over $100 billion a year. Shopee's current public process is manual investigation with a ~3-day review SLA; there is no AI-native adjudication layer for damage-photo claims today.
>
> We're *not* building an AI-image detector — that's a pixel-forensics arms race detectors lose, especially against edited photos and re-compressed uploads. We adjudicate the *whole claim* by scoring three signals into one Risk Score:
>
> 1. **Visual Claim Integrity** — a vision-language model reasons about whether the visible damage is physically plausible for the product and material (real ceramic doesn't fracture radially from that impact point; real cotton doesn't fray in straight lines), and whether the image actually matches the buyer's written complaint. This physical-plausibility reasoning is the project's technical core and catches photorealistic fakes that pixel forensics miss.
> 2. **Image Reuse** — perceptual hashing across every claim image on the platform, detecting when the same or near-identical photo appears across multiple accounts or sellers.
> 3. **Behavioural Context** — refund patterns evaluated against order context, product category, and delivery history rather than raw refund rate alone, so a cluster of refunds tied to one shipment reads as a logistics incident, not as fraud.
>
> Each signal produces a 0–1 score with a confidence weight; a reliability-weighted formula combines them into a single 0–100 Risk Score, categorised into Low (<30, release for standard processing), Elevated (30–65, route to a human reviewer), or High (>65, escalate or require additional evidence) — with hard-flag overrides for smoking guns (near-duplicate images, high-confidence implausibility) that route directly to High.
>
> A final language-model pass writes a plain-English explanation of every flagged signal so reviewers see precisely why a claim was scored as it was — e.g. *"High refund rate detected, but 8 of 10 claims share the same order ID and delivery date. Likely a logistics incident. Recommend: route to logistics, not fraud."*
>
> The output isn't an auto-reject — it's a ranked, explained triage layer for human reviewers, turning a multi-day investigation into a five-second pre-screen.
>
> Two things make this defensible. **Technically**, the physical-plausibility reasoning is hard to commoditise — it's domain reasoning, not pattern matching. **Structurally**, individual sellers only see their own claims; only Shopee sees across the platform — and only Shopee can detect a buyer submitting recycled damage photos to fifteen different sellers across fifteen different shops. That cross-platform visibility is the moat, and the Risk Score is how we make it concrete and actionable.
>
> We'll demo it live on a seeded dataset of fraudulent, legitimate, and deliberately ambiguous claims — including a false-positive trap (real damage that looks suspicious) to show the system is calibrated, not trigger-happy.

### Q2 — "Something you've built that you're proud of." (~100 words — fact-check before use)

> I built a dropship detection tool for buyers on Shopee and Carousell in Southeast Asia. You paste a product link and it returns a letter-grade score plus a percentage, telling you how likely the listing is reselling AliExpress wholesale stock at a large markup rather than genuine retail.
>
> A five-signal pipeline scores the listing across image-match, pricing, seller, and metadata signals — comparing against AliExpress catalogue data for the electronics category — then combines them into a hybrid percentage + letter grade, granular enough to compare listings and simple enough for an at-a-glance verdict. React frontend, Node/Express backend.

*Before submitting Q2: swap in your actual five signal names, and consider adding one line on why it fills a gap (existing dropship tools target US/EU patterns, not SEA pricing).*

---

## Open Questions

- Team size: **4 confirmed** (delegation section assumes this). Map A/B/C/D roles to your actual people's strengths.
- Which OpenAI model is current at the hackathon date? (Default to gpt-4o; swap to current equivalent.)
- Image-generation tool of choice for the fake-damage scenarios? (Strip C2PA on the hard case.)
- Are we recording a 90-second pitch video, or live-demoing only? (Affects hour 8–9 polish budget.)
