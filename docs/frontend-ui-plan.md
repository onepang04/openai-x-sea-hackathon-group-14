
# Frontend UI Plan

Person C owns the reviewer-facing React UI for the Claim Integrity demo. This document tracks agreed frontend decisions so the mocked UI and later backend integration stay aligned.

## Direction

- Build a dark-only reviewer dashboard with a premium, restrained feel inspired by Resend-style landing-page visuals and dashboard-like product surfaces.
- Use original visuals only. Do not copy Resend brand assets, images, logos, or copy.
- First screen is the working reviewer queue, not a landing page.
- The layout should show the claim queue and selected verdict detail in one operational view where practical.
- Keep the main workflow dense and useful: queue, Risk Score, Risk Band, evidence images, signal evidence, explanation, and reviewer actions.
- Include original premium visual treatments in the first pass so the dashboard feels polished, not purely utilitarian.

## Visual System

- Background: near-black.
- Panels: charcoal with thin neutral borders.
- Text: white or near-white primary, muted gray metadata.
- Risk colors: red/amber for High/Elevated, green for Low, neutral/blue only for informational states.
- Avoid a dominant dark-blue palette.
- Card and panel radius should stay at 8px or less.
- Use subtle border-driven depth; avoid heavy shadows.
- Use compact dashboard typography, not hero-scale marketing type.
- Add non-branded visual depth with original light-ray/floor-grid treatment, faint code/log panels, dashboard screenshot density, and signal-flow motifs.
- Visual treatments must support the reviewer workflow and must not obscure claim evidence, scores, actions, or signal details.

## Motion

- Minimal and functional only.
- Button press feedback: subtle scale, about 100-160ms.
- Row selection: fast background/border transition, about 120-180ms.
- Signal expansion: height/opacity transition under 200ms.
- Image switching: quick opacity crossfade under 160ms.
- Loading: stable skeleton state; avoid decorative spinners or looping hero motion.
- Respect `prefers-reduced-motion`.

## Reviewer Workflow

- Default queue sort: Risk Score descending.
- Default selected claim: highest-risk claim.
- Include all 8 seeded scenarios in mocked data, while keeping the demo narrative claims easy to find through sorting and badges.
- Do not add a visible demo rail. Backup recording can use the same real UI.
- Do not include keyboard shortcuts in the first pass.
- Local-only workflow states are allowed for the demo:
  - `Unreviewed`
  - `Released`
  - `Evidence requested`
  - `Escalated`
- Reviewer actions:
  - `Release`
  - `Request evidence`
  - `Escalate`
- Include an override note field.
- Avoid auto-deny language.

## Evidence Images

- Treat claim evidence as multiple images from day one: `evidenceImages: EvidenceImage[]`.
- Show one large active evidence image with a thumbnail strip when multiple images exist.
- If there is only one image, hide the strip.
- Support simple `Fit` and `Fill` controls.
- Keep the evidence viewer fixed-aspect so layout does not shift.
- Real/AI-generated dataset labels must not appear in the reviewer UI.

## Signal Presentation

- Make Visual Claim Integrity prominent because it is the core differentiator.
- Surface these Signal 1 details clearly when present:
  - physical plausibility
  - plausibility reasoning
  - contradictions
  - alternative explanations
  - text-image match
  - mismatches
- Show one row for each signal:
  - `VisualClaimIntegrity`
  - `ImageReuse`
  - `BehaviouralContext`
- Collapsed signal rows should show signal name, risk percentage, confidence percentage, qualitative confidence label, and one-line evidence.
- Expanded signal rows should show readable details, not raw JSON dumps.
- ImageReuse expansion may show a matched prior claim thumbnail, matching claim ID, and pHash distance.
- BehaviouralContext expansion should show triggered rules and the logistics-incident override when present.

## Risk Display

- Top-level label must be `Risk Score`, never `Fraud Probability`.
- Top-level Risk Score is a whole number from 0 to 100, without a percent sign.
- Signal-level risk and confidence can be shown as percentages plus qualitative labels.
- Show Risk Band as `Low`, `Elevated`, or `High`.
- If a hard flag applies, show:
  - a compact `Hard flag applied` badge near the verdict
  - the exact trigger in the relevant signal row
  - the underlying weighted score separately if the backend provides it

## Queue Controls

- Search by claim ID, product, or buyer.
- Filter chips:
  - `All`
  - `High`
  - `Elevated`
  - `Low`
  - `Needs action`
- Sort by:
  - Risk Score
  - Submitted
  - Claim value
- Include compact summary metrics:
  - Open claims
  - High risk
  - Elevated
  - Manual review queue or similar operational metric
- Avoid invented revenue/loss metrics unless data explicitly supports them.

## Mock Response Shape

Build the first UI against a local mocked response shape, then swap to Person B's API once published.

```ts
type RiskBand = "Low" | "Elevated" | "High";
type WorkflowState = "Unreviewed" | "Released" | "Evidence requested" | "Escalated";

interface EvidenceImage {
  id: string;
  url: string;
  alt: string;
}

interface ClaimQueueItem {
  id: string;
  buyer: string;
  product: string;
  reason: string;
  submittedAt: string;
  claimValue: number;
  riskScore: number;
  band: RiskBand;
  workflowState: WorkflowState;
  flags: string[];
}

interface SignalView {
  name: "VisualClaimIntegrity" | "ImageReuse" | "BehaviouralContext";
  risk: number;
  confidence: number;
  confidenceLabel: "Low confidence" | "Medium confidence" | "High confidence";
  evidence: string;
  hardFlagTrigger?: string;
  details?: Record<string, unknown>;
}

interface ClaimVerdictView {
  claim: ClaimQueueItem & {
    claimText: string;
    productDetails: string;
    evidenceImages: EvidenceImage[];
  };
  riskScore: number;
  weightedScore?: number;
  band: RiskBand;
  hardFlags: string[];
  explanation: string;
  recommendedAction: "Release" | "Request evidence" | "Escalate";
  signals: SignalView[];
}
```

## Integration Assumptions

- Frontend should be API-driven and avoid hardcoded image paths because the docs currently differ between `data/`, `mock-data/`, `images/claims/`, and `mock-data/images/`.
- Person B should publish `/api/claims`, `/api/claims/:id`, and `/api/claims/:id/score` response shapes before the mock data is swapped out.
- Missing score data should render a stable loading skeleton or compact retryable error, not a blank page.
- No auth, database, chart library, new signal, or metadata/EXIF surface.

## Development Approach

- Do not create a separate PRD for Person C unless scope materially changes.
- Treat this document plus `AGENTS.md` and `claim-integrity-agent-spec.md` as the frontend working brief.
- Use mocked frontend data first, then swap to Person B's API contract later.
- Use targeted behavior tests where they reduce integration risk:
  - queue sorting and filtering
  - local workflow state changes
  - evidence image thumbnail switching
  - signal expansion rendering
- Do not force strict TDD for purely visual polish work.
- Verify visual polish through local browser QA, typecheck, build, and screenshots where possible.
- Create handoff notes at phase boundaries so a fresh context window can continue without rediscovering decisions.

## QA Checklist

- All 8 seeded scenarios can be selected from the queue.
- Default view opens on the highest-risk claim.
- C003/C004 image reuse can show matched prior claim evidence when expanded.
- C006 false-positive trap does not present as an automatic denial.
- C007/C008 logistics incident override is visible in BehaviouralContext details when provided.
- Risk Score is whole-number and never labeled as probability.
- Actions update local workflow state without implying backend persistence.
- Text does not overflow buttons, badges, rows, or panels at desktop and mobile widths.
