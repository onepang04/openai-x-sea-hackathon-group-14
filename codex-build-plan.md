# Codex Build Plan — Claim-Integrity Agent (Event-Day Runbook)

*Ops companion to `codex-master-prompt.md` (the staged build prompts) and `claim-integrity-agent-spec.md`
(the what). This is the **how** on the day — setup, working rules, command rhythm, eval gate, timing.*

> **The staged build prompts now live in `codex-master-prompt.md`.** Paste that as your first Codex
> message; it drives Stages 0–6 with stop-and-review checkpoints. This runbook is everything around it.
> **Thesis:** Codex builds the machine. You tune the judgment. The demo sells the trust story.

---

## 0. Core principle

Codex is fast at boilerplate, scaffolding, wiring, and UI. It is *not* good at the two things that
decide whether the project is good:

1. **The Signal 1 prompt** — tuned by reading outputs against your real images (SSL2, frame, Calcifer).
   Codex can't judge "did this verdict make sense." See `signal-1-tuning-notes.md`.
2. **Mock-data realism + demo polish** — taste and judgment.

Codex writes ~80% of the *code* but maybe 40% of the *value*. Delegate aggressively; protect those two.

---

## 1. Codex setup (once, before the day)

`~/.codex/config.toml`:

```toml
model = "gpt-5.5"              # current recommended Codex model for ChatGPT sign-in
model_reasoning_effort = "medium"
model_reasoning_summary = "concise"

approval_policy = "on-request"     # Codex pauses before commands needing approval
sandbox_mode = "workspace-write"   # edit inside the repo, bounded fs/network
file_opener = "vscode"
```

Do **not** use `danger-full-access`.

**Repo layout** — assets in place before the first Codex task; Codex builds `apps/`:

```text
claim-integrity-agent/
├── AGENTS.md                 # Codex reads every task
├── signal-1-prompt.md        # the loadable Signal-1 system prompt (tuned)
├── data/
│   ├── claims.json  accounts.json  products.json  orders.json
│   ├── IMAGES_MANIFEST.md
│   └── images/{claims,reference}/
├── apps/web/                 # Vite + React + TS + Tailwind   (Person C)
└── apps/api/                 # Node + Express + TS            (Person B)
    └── src/{data,signals,scoring,ai,scripts}, server.ts
```

(Human reference docs — `claim-integrity-agent-spec.md`, `signal-1-tuning-notes.md`, this runbook — can
live in the repo but are NOT needed in Codex's path. Keep AGENTS.md authoritative.)

---

## 2. Two API providers (read once)

Same `openai` SDK, two clients:
- **OpenAI** — the Signal 1 **vision** call. `OPENAI_API_KEY`.
- **SEA-LION** — the **narrator** (reviewer prose), via its OpenAI-compatible API. Base URL
  `https://api.sea-lion.ai/v1`, `SEA_LION_API_KEY`, model e.g. `aisingapore/Qwen-SEA-LION-v4-32B-IT`
  (confirm via `/v1/models` on the day). SEA-LION has no vision model — vision stays on OpenAI.
- **Wrap the narrator with a fallback** (OpenAI text or a templated string). SEA-LION's free tier has
  been ~10 req/min, 1 key/user — fine for a 6-claim demo, but a rate-limit/timeout mid-demo would be
  ugly, and the score doesn't depend on the narrator. Make it swappable.

---

## 3. Working rules (durable)

- **Context first.** AGENTS.md in repo; paste the master prompt. Stops Codex inventing scope.
- **One task = one verifiable change.** Never "build the whole backend."
- **Verify after every task.** Run it, eyeball output, *then* proceed. Never chain two unverified tasks.
- **Commit per stage.** `git diff` → typecheck → build → commit. No 900-line diffs held together by prayer.
- **Regenerate, don't spelunk.** Broken after ~2 iterations = your *instruction* was wrong; rewrite it.
- **Don't ship code you can't explain.** A judge may ask how it works.
- **Time-box.** Blow a stage's budget → cut (see the spec's cut list), don't push.

---

## 4. Eval-first: the truth loop (build it in Stage 2)

Don't wait for the UI to know if the system works. The eval harness reads `_dev.expected_band` from
`claims.json` and prints expected vs actual per claim.

```bash
npm run eval -- --no-vision   # deterministic spine only (no OpenAI/SEA-LION cost) — built Stage 2
npm run eval                  # full pipeline incl. vision + narrator — Stage 3 on
```

`--no-vision` proves the aggregator, banding, hard-flag, image-reuse, and behavioural logic against
C003/C004 before you spend a single token. Sample full-eval read:

```text
C001 | SSL 2        | expected High      | actual High  92  hard_flag: visual_implausibility   PASS
  Visual .90/.91 | Reuse —     | Behaviour .80/.70
C003 | backpack     | expected High      | actual High  78  hard_flag: image_reuse              PASS
C005 | photo frame  | expected Low       | actual Low   14  hard_flag: none                     PASS  (trap held)
C006 | Calcifer     | expected Low       | actual Low   11  hard_flag: none                     PASS
```

**C005 and C006 landing Low is the accuracy gate.** Treat a regression there as a build-breaker.

---

## 5. Timeline (≈10h) — prompts are in the master prompt

| Hr | Stage (master prompt) | Driver | Others |
|----|----------------------|--------|--------|
| 0–1 | 0 scaffold + 1 types/data | B | A preps Signal-1 tuning; C sketches UI vs mocked score; D verifies images/JSON load |
| 1–4 | 2 deterministic spine (+ `eval --no-vision`) | B | **A tunes Signal 1 by hand against the 6 scenarios — the critical path** |
| 4–6 | 3 vision + SEA-LION narrator (full eval) | B + A | D integrates; C polishes verdict card |
| 6–8 | 4 API + 5 verdict-card UI | C | D leads end-to-end test across all 6 scenarios; A/B fix |
| 8–9 | 6 polish | D + C | A/B standby, targeted fixes only |
| 9–10 | rehearse | whole team, D drives | record backup video, buffer |

**Lock the API contract hour 1** (`POST /api/claim/:id/score`, `GET /api/claims`, the `ScoredClaim`
shape). **D owns "does it run end-to-end" from hr 4.** **No unverified Codex output to main.**

---

## 6. Event-day command rhythm

```bash
cd claim-integrity-agent            # assets already committed (planning repo)
codex                               # then paste codex-master-prompt.md
# per stage, after Codex implements:
git status && git diff
npm run typecheck && npm run build && npm run eval -- --no-vision
git add . && git commit -m "Stage N: <summary>"
```

---

## 7. The three traps

1. **Productivity trap.** Codex makes you *feel* fast → scope creep. No fourth signal. The demo, data,
   and prompt are human-paced.
2. **Understanding trap.** Don't accumulate agent code you can't explain. Read each stage's diff.
3. **Accuracy mirage.** A polished UI over a bad Signal-1 prompt is worse than an ugly UI over a sharp
   one. The prompt is the product.

---

Codex builds the machine; you tune the judgment; the demo sells the trust story.
