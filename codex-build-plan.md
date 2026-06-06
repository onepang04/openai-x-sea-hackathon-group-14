# Codex Build Plan — Claim-Integrity Agent (Runbook)

*Companion to `claim-integrity-agent-spec.md`. The spec is the **what** (incl. the full 4-person delegation table); this is the **how** — the hands-on Codex runbook for the day. ~10 hours actual build.*

> **Thesis:** Codex builds the machine. You tune the judgment. The demo sells the trust story.

---

## 0. The core principle

Codex is fast at **boilerplate, scaffolding, wiring, and UI**. It is *not* good at the two things that decide whether your project is good:

1. **The Signal 1 prompt** — requires you reading outputs against your specific scenarios and iterating. Codex can't judge "did this verdict make sense for a cracked ceramic mug."
2. **Mock-data realism + demo polish** — taste and judgment work.

Codex writes ~80% of the *code* but maybe 40% of the *value*. Delegate aggressively; protect those two human blocks.

---

## 1. Codex setup (do once, before the day)

`~/.codex/config.toml`:

```toml
model = "<current Codex model — VERIFY the exact string on the day; do not hardcode a stale one>"
model_reasoning_effort = "medium"
model_reasoning_summary = "concise"

approval_policy = "on-request"     # Codex pauses before commands needing approval
sandbox_mode = "workspace-write"   # edit inside the repo, bounded fs/network
file_opener = "vscode"
```

Do **not** use `danger-full-access`. You're building a refund-triage demo, not a launch system.

**Repo structure** — keep it boring and explicit; ask Codex to generate *this*, not invent its own. The `apps/web` + `apps/api` split is worth the small setup cost for a 4-person team because it gives B and C clean, non-colliding lanes:

```text
claim-integrity-agent/
├── AGENTS.md
├── claim-integrity-agent-spec.md
├── package.json            # root scripts orchestrate both apps
├── apps/
│   ├── web/                # Vite + React + TS + Tailwind  (Person C)
│   └── api/                # Node + Express + TS           (Person B)
│       └── src/
│           ├── data/       # JSON loaders
│           ├── signals/    # Signal.ts, visualClaimIntegrity.ts, imageReuse.ts, behaviouralContext.ts
│           ├── scoring/    # aggregateSignals.ts
│           ├── ai/         # openaiClient.ts, visualPrompt.ts, narrator.ts   (Person A owns visualPrompt)
│           ├── scripts/    # runSignal1Eval.ts, runFullPipeline.ts
│           └── server.ts
├── data/                   # claims.json, accounts.json, products.json, orders.json
└── images/claims/
```

Drop `AGENTS.md` + the spec in the repo root **before** the first Codex task — Codex reads them every task.

---

## 2. How to work with Codex (durable rules)

- **Context first.** AGENTS.md + spec in repo. Stops Codex inventing scope.
- **One task = one verifiable change.** Never "build the whole backend."
- **Verify after every task.** Agents produce confident garbage. Run it, eyeball output, *then* proceed. Never chain two unverified tasks.
- **Commit per phase.** `git diff` → typecheck → build → commit. Don't let Codex run three phases in one shot, or you get a 900-line diff held together by prayer.
- **Regenerate, don't spelunk.** Broken after ~2 iterations = your *instruction* was wrong. Rewrite the task; don't debug opaque output.
- **Don't ship code you can't explain.** A judge may ask how it works.
- **Time-box.** Each phase has a budget. Blow it → cut (see the spec's ruthless cut list), don't push.

---

## 3. Eval-first: build the truth loop in Phase 1 (the most important change)

**Do not wait for the UI to know whether your system works.** Two scripts, built as soon as the data + Signal 1 wrapper exist. They are Person A's and Person B's instruments — without them you tune blind and waste hours staring at a pretty UI wondering why a score feels wrong.

```bash
npm run eval:signal1     # Signal 1 over all 8 scenarios
npm run eval:pipeline    # full pipeline over all 8 scenarios
```

`eval:signal1` output (note: expected values come from the `_dev` block in claims.json):

```text
C001 | ceramic mug   | expected: Low  (legit)
  physical_plausibility: plausible   confidence: 0.88   risk: 0.12
  evidence: Chip at rim consistent with a knock; no impossible features.

C002 | phone screen  | expected: High (fraud)
  physical_plausibility: implausible confidence: 0.91   risk: 0.89
  evidence: Cracks radiate uniformly from centre with no impact origin.
```

`eval:pipeline` output:

```text
C002 | High | 91   hard_flag: visual_implausibility
  Visual .89/.91 | Reuse .00/1.0 | Behaviour .80/.70
C006 | Elevated | 41   hard_flag: none      (false-positive trap held: NOT High)
  Visual .15/.80 | Reuse .00/1.0 | Behaviour .20/.70
C007 | Low | 22   note: logistics-incident override applied
  Visual .10/.80 | Reuse .00/1.0 | Behaviour .15/.70 (8 claims share ORD-9981)
```

Read every line against the `_dev` expected band. This is your accuracy gate.

---

## 4. Phases (with copy-paste Codex prompts)

### Phase 0 — Pre-hackathon · *you, before the day*
Mock data (done — in `mock-data/`), images (per `IMAGES_MANIFEST.md`), env + Codex tested, AGENTS.md ready, Signal 1 prompt sketched. **Pre-building is fine since you're transferring to a fresh repo on the day** — keep the prep portable (briefs + JSON + prompts) so a clean re-commit is trivial.

### Phase 1 — Scaffold + eval harness (Hr 0–1) · *Person B drives; A/C/D prep lanes*

```text
Read AGENTS.md and claim-integrity-agent-spec.md.

Scaffold the project structure for Claim-Integrity Agent:
- Vite + React + TS + Tailwind frontend in apps/web
- Express + TS backend in apps/api
- root package scripts; JSON data loaders; Signal and SignalResult interfaces
- GET /api/claims, GET /api/claims/:id, POST /api/claims/:id/score returning a STUB result
- empty scripts/runSignal1Eval.ts and scripts/runFullPipeline.ts wired to npm run eval:signal1 / eval:pipeline

Constraints: no DB, no auth, no deployment, no OpenAI call yet, minimal UI.

Done when: npm install works; npm run dev starts both; frontend shows the claim list from the backend; clicking a claim shows a basic detail; score endpoint returns the stub shape; both eval scripts run (even if they print "not implemented").
```

### Phase 2 — Signal 1 wrapper + eval:signal1 (Hr 1–4) · *Person A owns; the critical path*

```text
Read AGENTS.md and signal-1-prompt.md.

Implement ONLY the Visual Claim Integrity OpenAI wrapper and strict schema:
- apps/api/src/ai/openaiClient.ts
- apps/api/src/ai/visualPrompt.ts   (use signal-1-prompt.md verbatim; do not improvise the prompt)
- apps/api/src/signals/visualClaimIntegrity.ts
- implement scripts/runSignal1Eval.ts

Requirements: OpenAI SDK; strict json_schema structured output per signal-1-prompt.md; map output to SignalResult; keep the prompt in one editable file. Do not implement other signals.

Done when: npm run eval:signal1 runs over all 8 seeded claims and prints id, plausibility, confidence, risk, evidence; errors are readable.
```

Then **Person A spends the rest of the block tuning the prompt by hand** against the tuning checklist in `signal-1-prompt.md`. Codex's part here is ~20 minutes; the tuning is the 3 hours.

### Phase 3 — Signals 2/3 + aggregator + eval:pipeline (Hr 4–6) · *Person B*

```text
Read AGENTS.md and the Signal 2, Signal 3, and Aggregation sections of the spec.

Implement:
- signals/imageReuse.ts (sharp + imghash; pHash all seeded images at startup; distance<5 hard flag, 5-8 medium, >8 none)
- signals/behaviouralContext.ts (deterministic rules + the shared-order-ID -> logistics-incident override that LOWERS risk)
- scoring/aggregateSignals.ts (parallel run; score = Σ(w·risk·conf)/Σ(w·conf) over available signals; weights V1.0/R0.9/B0.7; missing signals drop from both sums; hard-flag overrides; whole-number 0-100 score; Low<30/Elevated30-65/High>65)
- ai/narrator.ts (final OpenAI text call: score+band+evidences -> reviewer explanation + recommended action)
- implement scripts/runFullPipeline.ts

Done when: npm run eval:pipeline prints every claim with score, band, hard flags, per-signal evidence; C003/C004 hit High via reuse; C007/C008 are lowered via the logistics override; C006 stays out of High.
```

### Phase 4 — Frontend (Hr 6–8) · *Person C; design direction from the spec viz section*

```text
Read AGENTS.md and the UI requirements + viz description in the spec.

Build two screens:
1. Claim list — id, product, buyer, reason, score, band badge, sortable by score.
2. Verdict detail — large rounded score + band; submitted image; claim text; product details; per-signal breakdown rows; the contradictions/plausibility reasoning made PROMINENT; reviewer explanation callout; recommended action; approve / request evidence / escalate buttons; reviewer override note field.

Constraints: enterprise trust-and-safety style; Tailwind only; no chart libs; no auth; no new backend features; loading + error states.

Done when: every seeded scenario opens and renders the real score; the verdict card is screenshot-worthy.
```

### Phase 5 — Demo polish (Hr 8–9) · *Person D + C; A/B standby*
Smooth scenario switching, fix rough edges, make the physical-plausibility reasoning legible, pre-load the four demo scenarios in narrative order. Codex: small targeted fixes only — no new features.

### Phase 6 — Rehearse (Hr 9–10) · *whole team, D drives*
Run the 90-second demo three times against a timer. Record a backup video. Buffer.

---

## 5. Event-day command rhythm

```bash
mkdir claim-integrity-agent && cd claim-integrity-agent && git init
# add AGENTS.md + spec, then:
codex
```

First Codex message (no edits yet):
```text
Read AGENTS.md and claim-integrity-agent-spec.md. Summarise the architecture, scope, and build sequence. Do not edit files.
```
Then, per phase:
```text
Plan Phase N only. Do not code yet.
```
Approve → let it implement → then:
```bash
git status && git diff
npm run typecheck && npm run build
git add . && git commit -m "Phase N: <summary>"
```

---

## 6. The three traps

1. **Productivity trap.** Codex makes you *feel* fast, tempting scope creep. With 4 people the temptation is worse. The demo, data, and prompt are still human-paced. No fourth signal.
2. **Understanding trap.** Don't accumulate agent code you can't explain. Read what it built each phase.
3. **Accuracy mirage.** A polished UI over a bad Signal-1 prompt is a worse project than an ugly UI over a sharp one. The prompt is the product.

---

## 7. One-line summary

Codex builds the machine; you tune the judgment; the demo sells the trust story.
