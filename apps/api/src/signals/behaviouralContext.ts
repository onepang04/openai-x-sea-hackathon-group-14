import type { EnrichedClaim, SignalResult } from "../types";
import type { Signal } from "./types";

const LOGISTICS_CLUSTER_SIZE = 3;

export const behaviouralContext: Signal = {
  name: "BehaviouralContext",
  async evaluate(enrichedClaim: EnrichedClaim): Promise<SignalResult> {
    const { account, order, product } = enrichedClaim;
    const refundRate = account.total_orders > 0 ? account.total_refunds / account.total_orders : 0;
    const triggeredRules: string[] = [];
    let risk = 0;

    if (refundRate > 0.5) {
      risk += 0.4;
      triggeredRules.push("refund_rate>0.5");
    }

    if (account.claims_last_30_days >= 3) {
      risk += 0.4;
      triggeredRules.push("claims_last_30_days>=3");
    }

    if (account.account_age_days < 30 && product.price_sgd >= 50) {
      risk += 0.2;
      triggeredRules.push("account_age_days<30 and price_sgd>=50");
    }

    const baseRisk = clamp01(risk);
    const logisticsOverride = order.total_claims_against_order >= LOGISTICS_CLUSTER_SIZE;
    const finalRisk = logisticsOverride ? Math.min(baseRisk, 0.2) : baseRisk;

    return {
      name: "BehaviouralContext",
      risk: finalRisk,
      confidence: 0.7,
      evidence: buildEvidence(triggeredRules, logisticsOverride, order.id, order.total_claims_against_order),
      raw: {
        hardFlag: false,
        accountAgeDays: account.account_age_days,
        claimsLast30Days: account.claims_last_30_days,
        refundRate,
        triggeredRules,
        logisticsOverride,
        orderId: order.id,
        totalClaimsAgainstOrder: order.total_claims_against_order,
        baseRisk,
        finalRisk,
        override: logisticsOverride ? "Shared-order logistics override lowered behavioural risk." : undefined,
      },
    };
  },
};

function buildEvidence(
  triggeredRules: string[],
  logisticsOverride: boolean,
  orderId: string,
  totalClaimsAgainstOrder: number,
): string {
  const ruleEvidence =
    triggeredRules.length > 0
      ? `Behavioural rules fired: ${triggeredRules.join(", ")}.`
      : "No behavioural risk rules fired.";

  if (!logisticsOverride) {
    return ruleEvidence;
  }

  return `${ruleEvidence} Shared order ${orderId} has ${totalClaimsAgainstOrder} claims, so the logistics override lowered behavioural risk.`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
