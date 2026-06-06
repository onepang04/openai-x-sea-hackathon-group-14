# Claim-Integrity Agent — Summary Export

A concise export of architecture, scope, and build sequence. Authoritative build context for Codex is
`AGENTS.md` + `codex-master-prompt.md`; this is a human overview.

## Architecture

- Frontend: React + Vite + Tailwind — reviewer UI (claim list, verdict card, action buttons).
- Backend: Node + TypeScript + Express — signal runner, aggregator, final LLM narration.
- Models: OpenAI vision for `VisualClaimIntegrity`; SEA-LION (AI Singapore) for the narrator, via its
  OpenAI-compatible API (`https://api.sea-lion.ai/v1`, `SEA_LION_API_KEY`). Same SDK, two clients;
  read model names from env. Narrator has a fallback (OpenAI/templated) since the score doesn't depend on it.
- Data: in-memory JSON in `data/` (`claims.json`, `accounts.json`, `products.json`, `orders.json`),
  images in `data/images/claims/` and `data/images/reference/`, + a pHash index built at startup.
- Signals (pluggable, all implement `Signal.evaluate(EnrichedClaim)`):
  - `VisualClaimIntegrity` — physical-plausibility + text-image consistency (vision model). Prompt in `signal-1-prompt.md`.
  - `ImageReuse` — perceptual hash (sharp + imghash); Hamming distance vs other claims AND product reference photos.
  - `BehaviouralContext` — deterministic account/order heuristics, incl. shared-order logistics override that *lowers* risk.

See `AGENTS.md` and `claim-integrity-agent-spec.md`.

## Scope

- In: 0–100 **Risk Score** + band (Low/Elevated/High) + per-signal evidence + short LLM explanation
  for a human reviewer. Three signals only. Human-in-the-loop triage (no auto-deny). Runs on seeded
  JSON + images.
- Out: no DB/ORM, no auth, no EXIF/metadata/C2PA signal, no extra signals, no production deploy,
  no buyer/seller UI, no real Shopee integration.

## Scoring & Aggregation

- Per-signal: `{ name, risk (0..1), confidence (0..1), evidence, raw? }`.
- `score01 = Σ(weight·risk·confidence) / Σ(weight·confidence)` over **available** signals only.
- Weights: Visual 1.0, ImageReuse 0.9, Behavioural 0.7. `riskScore = round(score01 · 100)`.
- Bands: Low (<30), Elevated (30–65), High (>65).
- Hard flags force High (riskScore ≥ 75): Visual `implausible` AND `confidence > 0.85`; ImageReuse distance < 5.

## Per-claim runtime flow

1. Run signals with `Promise.allSettled(...)` — a failed signal is dropped, not fatal.
2. Aggregate available signals; apply hard flags.
3. SEA-LION narration (with fallback) → 2–3 sentence explanation + recommended action.

## Demo scenarios (6)

| Claim | Product | Role | Expected |
|-------|---------|------|----------|
| C001 | SSL 2 (radial metal cracks) | clear fraud | High |
| C002 | Oxford shirt (doctored from listing) | ambiguous, reference match | Elevated/High |
| C003 + C004 | backpack (reused image) | image-reuse flag | High |
| C005 | A4 photo frame (real shattered glass) | false-positive trap | **Low** |
| C006 | Calcifer tray (real breakage) | legitimate | **Low** |

> Note: no demo claim triggers the behavioural logistics override (all demo orders have one claim).
> Decide before demo — add a logistics scenario, or present the override as a capability.

## API contract (locked)

- `POST /api/claim/:id/score` → full `ScoredClaim`.
- `GET /api/claims` → claim summaries for the list view.
- Strip `_dev` from every response.

## Build sequence (staged; commit + review after each)

0 scaffold · 1 types + data layer · 2 deterministic spine (Image Reuse + Behavioural + aggregator,
`runEval --no-vision`) · 3 vision + narrator (full eval) · 4 API · 5 verdict-card UI · 6 polish + rehearse.

## Files of interest

- `AGENTS.md`, `codex-master-prompt.md`
- `claim-integrity-agent-spec.md`
- `signal-1-prompt.md` (clean loadable system prompt) + `signal-1-tuning-notes.md` (schema, mapping, checklist)
- `data/IMAGES_MANIFEST.md`
- `.codex/config.toml`

---

Regenerated 2026-06-06. Export file: `EXPORT_SUMMARY.md`.
