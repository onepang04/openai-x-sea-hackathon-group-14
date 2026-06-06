# CANONICAL DATASET — LOCKED (build to this exactly)

Single source of truth for the demo dataset. Data, backend, frontend, and the Signal-1 prompt/eval
must all use these exact claim IDs, product IDs, neutral filenames, and expected outcomes. **If
anything you hold conflicts with this file, THIS WINS.** Paste this whole file into your Codex session
as context before you build.

## The 9 claims

| Claim | Product (id) | Ground truth | Expected band | Caught by (star signal) |
|-------|--------------|--------------|---------------|-------------------------|
| C001 | Oxford shirt (P001) | legitimate | Low | S1 restraint — plausible seam tear, clean account |
| C002 | helmet visor (P002) | fraudulent | Elevated | S3 — plausible scratch but new-account / velocity |
| C003 | skincare set (P003) | fraudulent | High | S2 image reuse (pair with C004) |
| C004 | skincare set (P003) | fraudulent | High | S2 image reuse (pair with C003) |
| C005 | ceramic mug (P004) | fraudulent | High | S1 text-image mismatch + risky account |
| C006 | glass frame (P006) | legitimate | Low | S3 logistics override + S1 restraint (real shatter) |
| C007 | USB hub (P007) | legitimate | Low | S3 logistics override |
| C008 | monitor (P008) | legitimate | Low | S3 logistics override |
| C009 | SSL 2 audio interface (P005) | fraudulent | High | **S1 HARD FLAG** (metal can't fracture radially) + S2 doctored-from-listing |

**Coverage check** — every signal has a "fires" and a "stays calm" case:
- **Signal 1** fires: C009 (hard flag), C005 (mismatch). Stays calm: C001, C006 (real, plausible).
- **Signal 2** fires: C003/C004 (reuse), C009 (claim vs listing reference). Stays calm: the real photos.
- **Signal 3** fires: C002, C005 (risky accounts). Override: C006/C007/C008 (shared order).

## Products (8)
P001 shirt · P002 visor · P003 skincare set · P004 mug · **P005 SSL 2 audio interface** ·
P006 glass frame · P007 USB hub · P008 monitor.
- Only **P005 (SSL 2)** carries a `reference_image` (`ssl2_intact.jpg`) — the doctored-from-listing case.
- Real-damage products (shirt, glass frame, logistics items) have **no** `reference_image` — intentional.

## Key structures
- **Image-reuse pair:** C003 and C004 reference the SAME claim image, filed by two different accounts (A003, A004).
- **Logistics cluster:** C006/C007/C008 share `order_id: ORD-1006` (account A006), with
  `total_claims_against_order: 3`. A006 has `claims_last_30_days: 3` (would read risky) → the override
  pulls the whole cluster to Low. This is the Q1 headline example.

## Accounts
A001 clean (C001) · A002 new account (C002) · A003 reuse-ring (C003) · A004 serial returner (C004) ·
A005 risky (C005, C009) · A006 clean long-stander, logistics cluster (C006/C007/C008).

## Rules everyone honors
- Ground truth lives ONLY in `_dev`. NEVER in a filename, an API response, or the UI.
- Claim image filenames are neutral (content-describing — no "real"/"fake").
- `_dev` is stripped before any model call and before any API response.
- Don't renumber C001-C009. No DB, production auth, deploy infra, or manual claim input form.
- Demo seller login is allowed; seeded claims may all belong to the demo seller unless seller/product ownership is explicitly added.

## API contract (frontend + backend build to this)
- `POST /api/seller/login` → demo seller session for the dashboard.
- `GET /api/claims` → claim summaries (list view).
- `POST /api/claim/:id/score` → full `ScoredClaim`.
- `POST /api/claims/:id/score` → optional compatibility alias if already present.
- `ScoredClaim = { claimId, riskScore (0–100 whole number), band: "Low"|"Elevated"|"High", hardFlag: string|null, signals: SignalResult[], explanation, recommendedAction }`
- `SignalResult = { name, risk (0–1), confidence (0–1), evidence, raw? }`
- Label it **"Risk Score," never "Fraud Probability."**

## Per-stream notes
- **Data (D):** make claims / products / accounts / orders + images match the table exactly; SSL 2 = P005 / claim C009; neutral filenames; update `IMAGES_MANIFEST.md`.
- **Frontend (C):** claim IDs C001-C009; login gate, seller dashboard, and the `ScoredClaim` shape above.
- **Backend (B):** the endpoints above; strip `_dev`; the aggregator only consumes `SignalResult[]`.
- **Prompt/eval (A):** **C009** = hard-flag anchor; **C001 + C006** = false-positive anchors.
