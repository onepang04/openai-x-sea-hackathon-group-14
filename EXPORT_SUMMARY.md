# Claim-Integrity Agent — Summary Export

A concise export of architecture, scope, and build sequence for the Claim-Integrity Agent demo.

## Architecture

- Frontend: React + Vite + Tailwind — reviewer-facing UI (claim list, verdict card).
- Backend: Node + TypeScript + Express — signal runner, aggregator, final LLM narration.
- Models: OpenAI vision + text models (vision call for `VisualClaimIntegrity`, LLM for reviewer prose).
 - Models: OpenAI (vision) for `VisualClaimIntegrity`; Sealion (text) for narration/reviewer prose. Configure `OPENAI_API_KEY` for vision and `SEALION_API_KEY`/`SEALION_MODEL` for narration.
- Data: in-memory JSON files: `claims.json`, `accounts.json`, `products.json`, `orders.json` + pHash index for images.
- Signals (pluggable):
  - `VisualClaimIntegrity` — physical-plausibility + text-image consistency (vision model).
  - `ImageReuse` — perceptual-hash (sharp + imghash) dedup; Hamming distance checks.
  - `BehaviouralContext` — deterministic account/order heuristics (refund rates, recent claims, shared-order override).

See the repo docs: [AGENTS.md](AGENTS.md) and [claim-integrity-agent-spec.md](claim-integrity-agent-spec.md).

## Scope (in-scope / out-of-scope)

- In-scope:
  - Produce a 0–100 **Risk Score**, band (Low/Elevated/High), per-signal evidences, and a short LLM explanation for a human reviewer.
  - Three signals only; human-in-the-loop triage (no auto-deny).
  - Demo runs against seeded JSON + images in the repo.
- Out-of-scope (explicit):
  - No DB/ORM, no auth, no EXIF/metadata signal, no extra signals, no production deployment. See `AGENTS.md`.

## Scoring & Aggregation

- Per-signal output: `{ name, risk (0..1), confidence (0..1), evidence, raw? }`.
- Weighted aggregation:

```
score01 = Σ(weight·risk·confidence) / Σ(weight·confidence)
```

Weights: Visual = 1.0, ImageReuse = 0.9, Behavioural = 0.7. Scale `score01 * 100` → whole-number Risk Score.
- Bands: Low (<30), Elevated (30–65), High (>65).
- Hard flags override to High:
  - Visual: `physical_plausibility = implausible` AND `confidence > 0.85`.
  - ImageReuse: pHash Hamming distance < 5.

## Per-claim runtime flow

1. Run all signals in parallel: `await Promise.all(signals.map(s => s.evaluate(claim)))`.
2. Aggregate available signals with weights; apply hard flags if present.
3. Call LLM narration with score + per-signal evidences → 2–3 sentence explanation + recommended action.

## Build Sequence / Hackathon Timeline (recommended)

- Hr 0–1: Backend scaffold + lock API contract (`POST /api/claim/:id/score`), Signal-1 prompt skeleton, frontend mock.
- Hr 1–4: Tune Signal 1 on scenarios; implement Signals 2 & 3; aggregator + hard flags; UI build.
- Hr 4–6: Integrate Signal 1 into pipeline; connect frontend↔backend; seed images.
- Hr 6–8: End-to-end testing across scenarios; fixes.
- Hr 8–9: Demo polish and screenshot moment.
- Hr 9–10: Rehearse 90s demo, record backup.

## Minimal Checklist (first tasks)

- [ ] Verify or add OpenAI API key in `.env` (follow `SETUP.md`).
- [ ] Implement `VisualClaimIntegrity` wrapper (vision call + JSON schema output).
- [ ] pHash index script using `sharp` + `imghash` and a min-distance checker.
- [ ] `BehaviouralContext` heuristics implementation and shared-order override.
- [ ] Aggregator + hard-flag logic + `/api/claim/:id/score` route.
- [ ] Minimal React verdict card (band badge, per-signal evidence, LLM prose).

Branching workflow

- Follow `master` → `staging` → `feature`. Create feature branches from `staging` and open PRs targeting `staging` for review and integration. `staging` is pushed to `origin/staging` and visible to collaborators.

## Files of interest

- [AGENTS.md](AGENTS.md)
- [claim-integrity-agent-spec.md](claim-integrity-agent-spec.md)
- [signal-1-prompt.md](signal-1-prompt.md)
- [.codex/config.toml](.codex/config.toml)
- [data/IMAGES_MANIFEST.md](data/IMAGES_MANIFEST.md)

---

Generated on 2026-06-06. Export file: `EXPORT_SUMMARY.md`.
