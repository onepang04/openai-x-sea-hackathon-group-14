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

1. **The Signal 1 prompt** — tuned by reading outputs against your real images (SSL2, frame, logistics cluster).
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
├── apps/web/                 # Vite + React + TS + Tailwind, seller login + dashboard (Person C)
└── apps/api/                 # Node + Express + TS            (Person B)
    └── src/{data,signals,scoring,ai,scripts}, server.ts
```

(Human reference docs — `claim-integrity-agent-spec.md`, `signal-1-tuning-notes.md`, this runbook — can
live in the repo but are NOT needed in Codex's path. Keep AGENTS.md authoritative.)

---

## 2. One API provider (read once)

One `openai` client, two model ids:
- **Vision** — the Signal 1 call. `OPENAI_VISION_MODEL`, auth `OPENAI_API_KEY`.
- **Narrator** — the seller-facing prose, a text-only call. `OPENAI_NARRATOR_MODEL` (may be a cheaper text
  model), same `OPENAI_API_KEY`.
- **Wrap the narrator with a fallback** (a templated string built from the signal evidence). A
  rate-limit/timeout mid-demo would be ugly, and the score doesn't depend on the narrator. Make it swappable.

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
npm run eval -- --no-vision   # deterministic spine only (no OpenAI cost) — built Stage 2
npm run eval                  # full pipeline incl. vision + narrator — Stage 3 on
```

`--no-vision` proves the aggregator, banding, hard-flag, image-reuse, and behavioural logic against
C003/C004 before you spend a single token. Sample full-eval read:

```text
C001 | Oxford shirt | expected Low       | actual Low   12  hard_flag: none                     PASS
  Visual .90/.91 | Reuse —     | Behaviour .80/.70
C003 | skincare     | expected High      | actual High  78  hard_flag: image_reuse              PASS
C006 | photo frame  | expected Low       | actual Low   14  hard_flag: none                     PASS  (trap held)
C009 | SSL 2        | expected High      | actual High  92  hard_flag: visual_implausibility   PASS
```

**C001 and C006/C007/C008 landing Low is the accuracy gate.** Treat a regression there as a build-breaker.

---

## 5. Timeline (≈10h) — prompts are in the master prompt

| Hr | Stage (master prompt) | Driver | Others |
|----|----------------------|--------|--------|
| 0–1 | 0 scaffold + 1 types/data | B | A preps Signal-1 tuning; C sketches login/dashboard UI vs mocked score; D verifies images/JSON load |
| 1–4 | 2 deterministic spine (+ `eval --no-vision`) | B | **A tunes Signal 1 by hand against the 9 scenarios — the critical path** |
| 4–6 | 3 vision + OpenAI narrator (full eval) | B + A | D integrates; C polishes verdict card |
| 6–8 | 4 API + 5 seller login + verdict-card UI | C | D leads end-to-end test across all 9 scenarios; A/B fix |
| 8–9 | 6 polish | D + C | A/B standby, targeted fixes only |
| 9–10 | rehearse | whole team, D drives | record backup video, buffer |

**Lock the API contract hour 1** (`POST /api/seller/login`, `POST /api/claim/:id/score`, `GET /api/claims`, the `ScoredClaim`
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
