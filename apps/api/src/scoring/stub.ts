import type { Band, Claim, EnrichedClaim, ScoredClaim, SignalResult } from "../types";
import { scoreVisualClaimIntegrity } from "../signals/visualClaimIntegrity";

const SIGNAL_WEIGHTS: Record<string, number> = {
  VisualClaimIntegrity: 1,
  ImageReuse: 0.9,
  BehaviouralContext: 0.7,
};

export async function scoreClaimStub(
  enrichedClaim: EnrichedClaim,
  allClaims: Claim[],
): Promise<ScoredClaim> {
  // Run signals independently; a signal that throws (e.g. the vision call fails) is dropped,
  // not fatal — the aggregator scores over whatever succeeded (see AGENTS.md).
  const settled = await Promise.allSettled([
    scoreVisualClaimIntegrity(enrichedClaim),
    Promise.resolve(scoreImageReusePlaceholder(enrichedClaim, allClaims)),
    Promise.resolve(scoreBehaviouralPlaceholder(enrichedClaim)),
  ]);
  const signals = settled
    .filter((r): r is PromiseFulfilledResult<SignalResult> => r.status === "fulfilled")
    .map((r) => r.value);
  const hardFlag = getHardFlag(signals);
  const weightedScore = getWeightedScore(signals);
  const riskScore = hardFlag ? Math.max(75, weightedScore) : weightedScore;
  const band = getBand(riskScore);

  return {
    claimId: enrichedClaim.claim.id,
    riskScore,
    band,
    hardFlag,
    signals,
    explanation: buildExplanation(enrichedClaim, signals, band, hardFlag),
    recommendedAction: getRecommendedAction(band, hardFlag),
  };
}

function scoreImageReusePlaceholder({ claim }: EnrichedClaim, allClaims: Claim[]): SignalResult {
  const matchingClaim = allClaims.find(
    (candidate) =>
      candidate.id !== claim.id &&
      candidate.images.some((image) => claim.images.includes(image)),
  );

  if (matchingClaim) {
    return {
      name: "ImageReuse",
      risk: 0.95,
      confidence: 0.95,
      evidence: `Placeholder image-reuse rule: submitted image filename also appears on claim ${matchingClaim.id}.`,
      raw: {
        matchFound: true,
        matchingClaimId: matchingClaim.id,
        pHashDistance: 0,
        hardFlagTrigger: "placeholder: identical claim image filename",
      },
    };
  }

  return {
    name: "ImageReuse",
    risk: 0.02,
    confidence: 0.9,
    evidence: "Placeholder image-reuse rule: no duplicate claim image filename found in the JSON dataset.",
    raw: {
      matchFound: false,
      pHashDistance: 32,
    },
  };
}

function scoreBehaviouralPlaceholder({ account, order, product }: EnrichedClaim): SignalResult {
  const refundRate = account.total_orders > 0 ? account.total_refunds / account.total_orders : 0;
  const triggeredRules: string[] = [];

  if (order.total_claims_against_order > 1) {
    return {
      name: "BehaviouralContext",
      risk: 0.08,
      confidence: 0.78,
      evidence:
        "Placeholder behavioural rule: multiple claims share the same order, so this is treated as a possible logistics incident.",
      raw: {
        triggeredRules: ["total_claims_against_order>1"],
        accountAgeDays: account.account_age_days,
        claimsLast30Days: account.claims_last_30_days,
        refundRate: refundRate.toFixed(2),
        override: "Shared-order logistics override lowered behavioural risk.",
      },
    };
  }

  if (account.account_age_days < 30 && product.price_sgd >= 50) {
    triggeredRules.push("account_age_days<30 and claim_value>=50");
  }

  if (account.claims_last_30_days >= 3) {
    triggeredRules.push("claims_last_30_days>=3");
  }

  if (refundRate >= 0.5) {
    triggeredRules.push("refund_rate>=0.50");
  }

  const risk = triggeredRules.length === 0 ? 0.12 : Math.min(0.82, 0.34 + triggeredRules.length * 0.16);

  return {
    name: "BehaviouralContext",
    risk,
    confidence: 0.72,
    evidence:
      triggeredRules.length > 0
        ? `Placeholder behavioural rule: ${triggeredRules.join("; ")}.`
        : "Placeholder behavioural rule: account history is established with no major refund velocity trigger.",
    raw: {
      triggeredRules,
      accountAgeDays: account.account_age_days,
      claimsLast30Days: account.claims_last_30_days,
      refundRate: refundRate.toFixed(2),
    },
  };
}

function getWeightedScore(signals: SignalResult[]): number {
  let numerator = 0;
  let denominator = 0;

  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.name] ?? 1;
    numerator += weight * signal.risk * signal.confidence;
    denominator += weight * signal.confidence;
  }

  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function getHardFlag(signals: SignalResult[]): string | null {
  const imageReuse = signals.find((signal) => signal.name === "ImageReuse");
  if (isRecord(imageReuse?.raw) && imageReuse.raw.matchFound === true && imageReuse.confidence >= 0.9) {
    return "ImageReuse: duplicate evidence image placeholder";
  }

  const visual = signals.find((signal) => signal.name === "VisualClaimIntegrity");
  if (isRecord(visual?.raw) && typeof visual.raw.hardFlagTrigger === "string") {
    return "VisualClaimIntegrity: implausible physical damage with high confidence";
  }

  return null;
}

function getBand(riskScore: number): Band {
  if (riskScore > 65) {
    return "High";
  }

  if (riskScore >= 30) {
    return "Elevated";
  }

  return "Low";
}

function getRecommendedAction(band: Band, hardFlag: string | null): string {
  if (hardFlag || band === "High") {
    return "Escalate";
  }

  if (band === "Elevated") {
    return "Request evidence";
  }

  return "Release";
}

function buildExplanation(
  { claim, product }: EnrichedClaim,
  signals: SignalResult[],
  band: Band,
  hardFlag: string | null,
): string {
  const signalSummary = signals
    .map((signal) => `${signal.name} ${Math.round(signal.risk * 100)}%`)
    .join(", ");

  if (hardFlag) {
    return `Placeholder score for ${claim.id}: ${hardFlag} pushed this ${product.name} claim into the ${band} band. Current signal placeholders are ${signalSummary}; replace these values when the real engines merge.`;
  }

  return `Placeholder score for ${claim.id}: this ${product.name} claim is currently ${band} based on ${signalSummary}. Replace this deterministic placeholder explanation when the narrator engine merges.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
