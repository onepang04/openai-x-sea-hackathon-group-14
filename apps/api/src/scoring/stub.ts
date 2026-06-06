import type { Band, Claim, EnrichedClaim, ScoredClaim, SignalResult } from "../types";

const SIGNAL_WEIGHTS: Record<string, number> = {
  VisualClaimIntegrity: 1,
  ImageReuse: 0.9,
  BehaviouralContext: 0.7,
};

export function scoreClaimStub(enrichedClaim: EnrichedClaim, allClaims: Claim[]): ScoredClaim {
  const signals = [
    scoreVisualPlaceholder(enrichedClaim),
    scoreImageReusePlaceholder(enrichedClaim, allClaims),
    scoreBehaviouralPlaceholder(enrichedClaim),
  ];
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

function scoreVisualPlaceholder({ claim, product }: EnrichedClaim): SignalResult {
  const claimText = claim.claim_text.toLowerCase();
  const material = product.material.toLowerCase();

  if (material.includes("aluminium") && /crack|fractur|shatter/.test(claimText)) {
    return {
      name: "VisualClaimIntegrity",
      risk: 0.88,
      confidence: 0.82,
      evidence:
        "Placeholder visual rule: claim text describes cracking across an aluminium chassis, which is physically suspicious for this material.",
      raw: {
        physicalPlausibility: "implausible",
        plausibilityReasoning:
          "Aluminium housings usually dent, bend, or scuff before forming glass-like radial cracks.",
        contradictions: ["Claimed crack pattern conflicts with the product material."],
        alternativeExplanations: ["A detached knob or connector damage could still be plausible transit damage."],
        textImageMatch: true,
        mismatches: [],
        hardFlagTrigger: "placeholder: aluminium crack/fracture wording",
      },
    };
  }

  if (claimText.includes("bottom") && claim.images.some((image) => image.includes("mug"))) {
    return {
      name: "VisualClaimIntegrity",
      risk: 0.72,
      confidence: 0.76,
      evidence:
        "Placeholder visual rule: the claim describes bottom damage, while the available mug evidence should be checked for text-image alignment.",
      raw: {
        physicalPlausibility: "uncertain",
        plausibilityReasoning:
          "Ceramic cracking is plausible, but the described damage location needs review against the submitted image.",
        contradictions: ["Damage location in claim text may not match the visible evidence."],
        alternativeExplanations: ["The photo may not show every side of the product."],
        textImageMatch: false,
        mismatches: ["Claim says bottom damage; evidence filename indicates a general mug crack view."],
      },
    };
  }

  return {
    name: "VisualClaimIntegrity",
    risk: 0.18,
    confidence: 0.62,
    evidence:
      "Placeholder visual rule: product material and claim text describe a plausible damage mode; real vision scoring will replace this.",
    raw: {
      physicalPlausibility: "plausible",
      plausibilityReasoning:
        "The reported damage falls within the product's listed typical failure modes or common transit damage patterns.",
      contradictions: [],
      alternativeExplanations: ["Transit handling or packaging compression could explain the reported damage."],
      textImageMatch: true,
      mismatches: [],
    },
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
  if (isRecord(visual?.raw) && visual.raw.physicalPlausibility === "implausible" && visual.confidence >= 0.75) {
    return "VisualClaimIntegrity: physical implausibility placeholder";
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
