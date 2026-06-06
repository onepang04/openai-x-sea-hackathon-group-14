# Claim-Integrity Agent

Hackathon demo for refund-claim integrity triage in a Shopee-style marketplace.
A Shopee internal reviewer signs in, opens a queue of buyer refund claims, and
uses an explained **Risk Score** to decide the next review action.

The app does not auto-approve or auto-reject claims. It is a human-in-the-loop
triage layer over webhook-fed claim data. For the demo, the webhook source is
represented by the locked JSON dataset and evidence images in `data/`.

## End-to-end Workflow

1. A demo Shopee reviewer signs in to the dashboard.
2. The frontend loads reviewer-visible refund claims from the API.
3. The backend enriches each claim with account, product, and order context.
4. Three signals run over the enriched claim:
   - `VisualClaimIntegrity`: OpenAI vision call for physical plausibility and text-image consistency.
   - `ImageReuse`: perceptual-hash matching against other claim photos and product reference images.
   - `BehaviouralContext`: deterministic account/order heuristics, including the logistics-incident override.
5. The aggregator combines available signal results into a whole-number 0-100
   **Risk Score**, applies hard-flag overrides, and assigns a `Low`,
   `Elevated`, or `High` Risk Band.
6. A final OpenAI narrator call writes a short reviewer-facing explanation and
   recommended action. If narration fails, a templated fallback is used; the
   score does not depend on narration.
7. The reviewer records a local advisory action: `Release`, `Request evidence`,
   or `Escalate`.

## Architecture

```text
React + Vite + Tailwind  ->  Node + TypeScript + Express  ->  OpenAI vision
reviewer dashboard           signal runner + aggregator       OpenAI narrator
                                      |
                              in-memory JSON + images
```

There is no database, ORM, production authentication, buyer-facing UI, manual
claim input form, metadata/EXIF signal, or real Shopee integration.

## Quick Start

Install dependencies:

```bash
npm install
```

Create the app environment file:

```bash
cp .env.example .env
```

Fill in:

```bash
OPENAI_API_KEY=sk-...
OPENAI_VISION_MODEL=<current-vision-model>
OPENAI_NARRATOR_MODEL=<current-text-model>
```

Start the API in one terminal:

```bash
npm run dev
```

Start the web app in another terminal:

```bash
npm run dev:web
```

The API defaults to `http://localhost:3000`. In local Vite development, the web
app points to that API by default. To override it, set `VITE_API_BASE_URL`.

## Demo Path

Use the reviewer dashboard to walk these seeded cases:

- `C019`: SSL 2 audio interface, doctored-from-listing hard flag, expected `High`.
- `C005` and `C020`: same skincare evidence photo reused across accounts, expected `High`.
- `C010`, `C011`, and `C012`: shared-order logistics cluster, override lowers risk to `Low`.
- `C014`: plausible shattered-glass false-positive anchor, expected `Low`.

The locked active dataset has 18 claims: `C001` through `C020`, excluding
`C002` and `C008`. Ground truth exists only in `_dev` fields and must never be
sent to a model or exposed in the reviewer UI.

## Scoring Model

Every signal returns:

```ts
{
  name: string;
  risk: number;       // 0..1
  confidence: number; // 0..1
  evidence: string;
  raw?: unknown;
}
```

Aggregation uses a confidence-weighted average over available signals only:

```text
score01 = sum(weight * risk * confidence) / sum(weight * confidence)
```

Weights:

- Visual: `1.0`
- Image Reuse: `0.9`
- Behavioural: `0.7`

Bands:

- `Low`: score below `30`
- `Elevated`: score `30` through `65`
- `High`: score above `65`

Hard flags force `High` with a minimum score of `75`.

## API Surface

- `POST /api/reviewer/login` - target demo reviewer login contract.
- `GET /api/claims` - sanitized claim summaries.
- `GET /api/claims/:id` - sanitized enriched claim details.
- `POST /api/claim/:id/score` - score one claim.
- `POST /api/claims/:id/score` - compatibility alias.
- `GET /api/verdicts` - enriched claim plus scored verdicts for the dashboard.
- `GET /api/verdicts/stream` - newline-delimited streaming verdict load.

The frontend currently falls back to `/api/seller/login` while the backend login
route is being renamed around the reviewer workflow.

## Verification

Run typechecks:

```bash
npm run typecheck
```

Build the web app:

```bash
npm run build
```

Run the full pipeline eval:

```bash
npm run eval:pipeline
```

Run the Signal 1 vision tuning eval:

```bash
npm run eval:signal1
```

The evals require the OpenAI environment variables. The make-or-break regression
gate is that the legitimate false-positive anchors and the `C010`/`C011`/`C012`
logistics cluster remain `Low`.

## Data and Docs

- `data/CANONICAL_DATASET.md` - locked active dataset and expected bands.
- `data/IMAGES_MANIFEST.md` - exact image filenames and scenario roles.
- `AGENTS.md` - authoritative agent/build constraints.
- `CONTEXT.md` - domain vocabulary.
- `claim-integrity-agent-spec.md` - product/spec overview.
- `codex-master-prompt.md` - staged build sequence.
- `codex-build-plan.md` - event-day runbook.
- `docs/frontend-ui-plan.md` - reviewer dashboard design and QA notes.

## Branching Workflow

- Repository workflow: `master` -> `staging` -> `feature`.
- Create feature branches from `staging`.
- Open PRs targeting `staging` for review.
