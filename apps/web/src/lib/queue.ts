import type { ClaimVerdictView, RiskBand, WorkflowState } from "../types";

export const queueFilters = ["All", "High", "Elevated", "Low", "Needs action"] as const;
export type QueueFilter = (typeof queueFilters)[number];

export const queueSorts = ["Risk Score", "Submitted", "Claim value"] as const;
export type QueueSort = (typeof queueSorts)[number];

type WorkflowMap = Record<string, WorkflowState>;

export function getDefaultClaimId(verdicts: ClaimVerdictView[]): string {
  return [...verdicts].sort((a, b) => b.riskScore - a.riskScore)[0]?.claim.id ?? "";
}

export function applyQueueControls(
  verdicts: ClaimVerdictView[],
  workflowByClaim: WorkflowMap,
  query: string,
  filter: QueueFilter,
  sort: QueueSort,
): ClaimVerdictView[] {
  const normalizedQuery = query.trim().toLowerCase();

  return verdicts
    .map((verdict) => ({
      ...verdict,
      claim: {
        ...verdict.claim,
        workflowState: workflowByClaim[verdict.claim.id] ?? verdict.claim.workflowState,
      },
    }))
    .filter((verdict) => matchesQuery(verdict, normalizedQuery))
    .filter((verdict) => matchesFilter(verdict, filter))
    .sort((a, b) => compareVerdicts(a, b, sort));
}

function matchesQuery(verdict: ClaimVerdictView, query: string): boolean {
  if (!query) {
    return true;
  }

  const searchable = [
    verdict.claim.id,
    verdict.claim.product,
    verdict.claim.buyer,
    verdict.claim.reason,
  ].join(" ");

  return searchable.toLowerCase().includes(query);
}

function matchesFilter(verdict: ClaimVerdictView, filter: QueueFilter): boolean {
  if (filter === "All") {
    return true;
  }

  if (filter === "Needs action") {
    return verdict.claim.workflowState === "Unreviewed" && verdict.recommendedAction !== "Release";
  }

  return verdict.band === (filter as RiskBand);
}

function compareVerdicts(a: ClaimVerdictView, b: ClaimVerdictView, sort: QueueSort): number {
  if (sort === "Submitted") {
    return Date.parse(b.claim.submittedAt) - Date.parse(a.claim.submittedAt);
  }

  if (sort === "Claim value") {
    return b.claim.claimValue - a.claim.claimValue;
  }

  return b.riskScore - a.riskScore;
}
