# Claim-Integrity Agent — Summary Export

A concise export of architecture, scope, and build sequence. Authoritative build context for Codex is
`AGENTS.md` + `codex-master-prompt.md`; this is a human overview.

## Architecture

- Frontend: React + Vite + Tailwind — reviewer login + internal dashboard (claim list, verdict card, action buttons).
- Backend: Node + TypeScript + Express — demo reviewer login, signal runner, aggregator, final LLM narration.
- Models: OpenAI vision for `VisualClaimIntegrity`; OpenAI text for the narrator. One `openai` client,
  two model ids (`OPENAI_VISION_MODEL` / `OPENAI_NARRATOR_MODEL`) on `OPENAI_API_KEY`;
  read model names from env. Narrator has a templated fallback since the score doesn't depend on it.
- Data: in-memory JSON in `data/` (`claims.json`, `accounts.json`, `products.json`, `orders.json`),
  images in `data/images/claims/` and `data/images/reference/`, + a pHash index built at startup.
- Signals (pluggable, all implement `Signal.evaluate(EnrichedClaim)`):
  - `VisualClaimIntegrity` — physical-plausibility + text-image consistency (vision model). Prompt in `signal-1-prompt.md`.
  - `ImageReuse` — perceptual hash (sharp + imghash); Hamming distance vs other claims AND product reference photos.
  - `BehaviouralContext` — deterministic account/order heuristics, incl. shared-order logistics override that *lowers* risk.

See `AGENTS.md` and `claim-integrity-agent-spec.md`.

## Scope

- In: demo reviewer login, Shopee internal claim dashboard, 0–100 **Risk Score** + band (Low/Elevated/High) +
  per-signal evidence + short LLM explanation for reviewer verification. Three signals only.
  Human-in-the-loop triage (no auto-deny). Runs on seeded JSON + images as webhook-fed claim data.
- Out: no DB/ORM, no production auth, no EXIF/metadata/C2PA signal, no extra signals,
  no production deploy, no buyer UI, no manual claim input form, no real Shopee integration.

## Scoring & Aggregation

- Per-signal: `{ name, risk (0..1), confidence (0..1), evidence, raw? }`.
- `score01 = Σ(weight·risk·confidence) / Σ(weight·confidence)` over **available** signals only.
- Weights: Visual 1.0, ImageReuse 0.9, Behavioural 0.7. `riskScore = round(score01 · 100)`.
- Bands: Low (<30), Elevated (30–65), High (>65).
- Hard flags force High (riskScore ≥ 75): Visual `implausible` AND `confidence > 0.85`; ImageReuse distance < 5.

## Per-claim runtime flow

1. Run signals with `Promise.allSettled(...)` — a failed signal is dropped, not fatal.
2. Aggregate available signals; apply hard flags.
3. OpenAI narration (with fallback) → 2–3 sentence explanation + recommended action.

## Demo scenarios

The active demo set is locked in `data/CANONICAL_DATASET.md`.

| Claims | Product/theme | Role | Expected |
|--------|---------------|------|----------|
| C001, C003, C006, C013, C015, C017, C018 | plausible damage on risky accounts | behaviour-only review queue | Elevated |
| C004, C007, C009, C014, C016 | plausible real damage or fulfilment issues | false-positive anchors | **Low** |
| C005 + C020 | skincare set | reused image pair | High |
| C010/C011/C012 | plastic containers | logistics override | **Low** |
| C019 | SSL 2 audio interface | doctored-from-listing hero case | High |

## API contract (locked)

- `POST /api/reviewer/login` → demo reviewer session.
- `GET /api/claims` → claim summaries for the list view.
- `POST /api/claim/:id/score` → full `ScoredClaim`.
- `POST /api/claims/:id/score` → optional compatibility alias if already present.
- Strip `_dev` from every response.

## Build sequence (staged; commit + review after each)

0 scaffold · 1 types + data layer · 2 deterministic spine (Image Reuse + Behavioural + aggregator,
`runEval --no-vision`) · 3 vision + narrator (full eval) · 4 API · 5 reviewer login + verdict-card UI ·
6 polish + rehearse.

## Files of interest

- `AGENTS.md`, `codex-master-prompt.md`
- `claim-integrity-agent-spec.md`
- `signal-1-prompt.md` (clean loadable system prompt) + `signal-1-tuning-notes.md` (schema, mapping, checklist)
- `data/IMAGES_MANIFEST.md`
- `.codex/config.toml`

---

Regenerated 2026-06-06. Export file: `EXPORT_SUMMARY.md`.
