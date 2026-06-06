import type { ScoredClaim } from "../types";

export function scoreClaimStub(claimId: string): ScoredClaim {
  return {
    claimId,
    riskScore: 0,
    band: "Low",
    hardFlag: null,
    signals: [],
    explanation: "Scoring pipeline not implemented yet.",
    recommendedAction: "Release for standard processing",
  };
}
