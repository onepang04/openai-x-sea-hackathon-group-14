import { claims } from "../data/load";
import { narrateScore } from "../ai/narrator";
import { behaviouralContext } from "../signals/behaviouralContext";
import { ImageReuse } from "../signals/imageReuse";
import { scoreVisualClaimIntegrity } from "../signals/visualClaimIntegrity";
import type { Signal } from "../signals/types";
import type { EnrichedClaim, ScoredClaim, SignalResult } from "../types";
import { aggregateSignals } from "./aggregate";

const visualClaimIntegrity: Signal = {
  name: "VisualClaimIntegrity",
  evaluate: scoreVisualClaimIntegrity,
};

const defaultSignals: Signal[] = [visualClaimIntegrity, new ImageReuse(claims), behaviouralContext];

export async function scoreClaim(
  enrichedClaim: EnrichedClaim,
  signals: Signal[] = defaultSignals,
): Promise<ScoredClaim> {
  const signalResults = await evaluateAvailableSignals(enrichedClaim, signals);
  const aggregate = aggregateSignals(signalResults);
  const narration = await narrateScore({
    enrichedClaim,
    riskScore: aggregate.riskScore,
    band: aggregate.band,
    hardFlag: aggregate.hardFlag,
    signals: signalResults,
  });

  return {
    claimId: enrichedClaim.claim.id,
    riskScore: aggregate.riskScore,
    band: aggregate.band,
    hardFlag: aggregate.hardFlag,
    signals: signalResults,
    explanation: narration.explanation,
    recommendedAction: narration.recommendedAction,
  };
}

async function evaluateAvailableSignals(
  enrichedClaim: EnrichedClaim,
  signals: Signal[],
): Promise<SignalResult[]> {
  const settled = await Promise.allSettled(signals.map((signal) => signal.evaluate(enrichedClaim)));
  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}
