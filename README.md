# Claim-Integrity Agent

Hackathon demo for refund-claim integrity triage in a Shopee-style marketplace.
A seller logs in, sees buyer refund claims for the seller's products, and uses
the triage dashboard to verify them. Given a webhook-fed buyer refund claim,
claim evidence image(s), product, account, and order context, the system produces a whole-number
**Risk Score**, a Low/Elevated/High band, per-signal evidence, and a
seller-facing explanation.

Claim intake is assumed to come from Shopee/platform data via webhook. The demo
uses the seeded JSON files instead of a manual input form.

Authoritative build context:

- `AGENTS.md`
- `codex-master-prompt.md`
- `claim-integrity-agent-spec.md`
- `codex-build-plan.md`
- `CONTEXT.md`

Data lives in `data/`; claim images belong in `data/images/claims/`, and
reference listing images belong in `data/images/reference/`. See
`data/IMAGES_MANIFEST.md` for the exact filenames.

Branching workflow

- Repository workflow: `master` → `staging` → `feature`.
- Create feature branches off `staging` and open PRs targeting `staging` for review.
- `staging` is pushed to `origin/staging` and available to collaborators.
