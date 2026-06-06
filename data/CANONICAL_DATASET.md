# CANONICAL DATASET — LOCKED (build to this exactly)

Single source of truth for the demo dataset. Data, backend, frontend, and the Signal-1 prompt/eval
must all use these exact claim IDs, product IDs, neutral filenames, and expected outcomes. **If
anything you hold conflicts with this file, THIS WINS.** Paste this whole file into your Codex session
as context before you build.

18 active claims · 9 products · 16 accounts · realistic SEA marketplace photos, with curated showcase cases
grafted in so every signal capability has both a "fires" and a "stays-calm" example.

`C002` and `C008` are intentionally excluded from the active demo/eval set because their findings were ambiguous
for the current problem statement. Do not renumber the remaining claims.

## The 18 active claims

| Claim | Product (id) | Ground truth | Expected band | Caught by (star signal) |
|-------|--------------|--------------|---------------|-------------------------|
| C001 | shirt (P001) | fraudulent | Elevated | S3 behaviour (plausible damage, no hard signal) |
| C003 | visor (P002) | fraudulent | Elevated | S3 behaviour |
| C004 | visor (P002) | legitimate | Low | S1 restraint |
| C005 | skincare (P003) | fraudulent | High | **S2 image reuse** (pair with C020) |
| C006 | skincare (P003) | fraudulent | Elevated | S3 behaviour |
| C007 | skincare (P003) | legitimate | Low | S1 restraint |
| C009 | mug (P004) | legitimate | Low | S1 restraint |
| C010 | container (P005) | legitimate | Low | **S3 logistics override** (ORD-2010) |
| C011 | container (P005) | legitimate | Low | **S3 logistics override** (ORD-2010) |
| C012 | container (P005) | legitimate | Low | **S3 logistics override** (ORD-2010) |
| C013 | glass frame (P006) | fraudulent | Elevated | S3 behaviour |
| C014 | glass frame (P006) | legitimate | Low | S1 restraint |
| C015 | USB hub (P007) | fraudulent | Elevated | S3 behaviour |
| C016 | USB hub (P007) | legitimate | Low | S1 restraint |
| C017 | monitor (P008) | fraudulent | Elevated | S3 behaviour |
| C018 | monitor (P008) | fraudulent | Elevated | S3 behaviour (two photos) |
| C019 | SSL 2 (P009) | fraudulent | High | **S2 doctored-from-listing** (ref `ssl2_intact.jpg`) + S1 implausibility |
| C020 | skincare (P003) | fraudulent | High | **S2 image reuse** (pair with C005) |

**Coverage — every signal has a fires-case and a stays-calm case:**
- **S1 implausibility** fires: C019 (metal cracks). Stays calm: all 8 active legitimate claims.
- **S2 reuse** fires: C005 ↔ C020 (shared image). **S2 reference** fires: C019 (vs `ssl2_intact.jpg`). Stays calm: every unique real photo.
- **S3 risk-up** fires: the behaviour-only frauds → Elevated. **S3 override** fires: C010/C011/C012 (ORD-2010) → Low.

## Calibration principle (why most frauds are Elevated, not High)
**High requires a hard signal** — image reuse, doctored-from-listing, or a clear S1 implausibility/mismatch.
A fraud with a *plausible* photo from a risky account is correctly **Elevated** (route to human), not High —
that's the "calibrated, not trigger-happy" thesis. Don't force behaviour-only frauds to High.

## Key structures
- **Image-reuse pair:** C005 and C020 reference the SAME file (`skincare_jar_cracked_closeup.jpg`) across accounts A005 and A012.
- **Doctored-from-listing:** P009 has `reference_image: ssl2_intact.jpg`; C019's `ssl2_broken.jpg` is edited from it → small pHash distance → hard flag.
- **Logistics cluster:** C010/C011/C012 share `order_id: ORD-2010` (account A010), `items: 3`, `total_claims_against_order: 3`. A010 looks risky (`claims_last_30_days: 3`) → the override pulls the cluster to Low.

## Rules everyone honors
- Ground truth lives ONLY in `_dev`. NEVER in a filename, an API response, or the UI.
- Claim image filenames are neutral (content-describing — no "real"/"fake").
- `_dev` is stripped before any model call and before any API response.
- Don't renumber active claims. No DB, production auth, deploy infra, or manual claim input form.
- Demo reviewer login is allowed; seeded claims may all be visible to the demo Shopee reviewer unless reviewer assignment is explicitly added.
- Only P009 carries a `reference_image`; don't invent fields; no DB / auth / deploy infra.

## API contract (frontend + backend build to this)
- `POST /api/reviewer/login` → demo reviewer session for the dashboard.
- `GET /api/claims` → claim summaries (list view).
- `POST /api/claims/:id/score` (alias `/api/claim/:id/score`) → full `ScoredClaim`.
- `ScoredClaim = { claimId, riskScore (0–100 int), band: "Low"|"Elevated"|"High", hardFlag: string|null, signals: SignalResult[], explanation, recommendedAction }`
- `SignalResult = { name, risk (0–1), confidence (0–1), evidence, raw? }`
- Label it **"Risk Score," never "Fraud Probability."**

## Per-stream notes
- **Data:** claims / products / accounts / orders + images match the table exactly; only P009 has a reference image.
- **Frontend:** active claim IDs are C001–C020 excluding C002 and C008; render the `ScoredClaim` shape above; the UI reads the live API.
- **Backend:** real Signals 1/2/3 + aggregator + narrator; strip `_dev`; the aggregator only consumes `SignalResult[]`.
- **Prompt/eval (Signal 1):** false-positive anchors = the 8 active legits; C019 is the active S1 hard-signal showcase and is also owned by S2 reference matching.
