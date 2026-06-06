# Claim-Integrity Agent

Hackathon demo for refund-claim integrity triage in a Shopee-style marketplace.
Given a buyer refund claim, image(s), product, account, and order context, the
system produces a whole-number **Risk Score**, a Low/Elevated/High band,
per-signal evidence, and a reviewer-facing explanation.

Authoritative build context:

- `AGENTS.md`
- `codex-master-prompt.md`
- `claim-integrity-agent-spec.md`
- `codex-build-plan.md`

Data lives in `data/`; claim images belong in `data/images/claims/`, and
reference listing images belong in `data/images/reference/`. See
`data/IMAGES_MANIFEST.md` for the exact filenames.

Branching workflow

- Repository workflow: `master` → `staging` → `feature`.
- Create feature branches off `staging` and open PRs targeting `staging` for review.
- `staging` is pushed to `origin/staging` and available to collaborators.
