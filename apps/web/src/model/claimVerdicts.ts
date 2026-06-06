import type {
  PublicClaim,
  PublicEnrichedClaim,
  ScoredClaim,
  SignalResult,
} from "./apiContracts";
import type {
  ClaimVerdictView,
  EvidenceImage,
  RecommendedAction,
  SignalName,
  SignalView,
} from "../types";

const DEFAULT_DEV_API_BASE_URL = "http://localhost:3000";

export const apiBaseUrl = getApiBaseUrl();

export async function loadClaimVerdicts(): Promise<ClaimVerdictView[]> {
  const claims = await requestJson<PublicClaim[]>("/api/claims");

  const verdicts = await Promise.all(
    claims.map(async (claim) => {
      const [enrichedClaim, score] = await Promise.all([
        requestJson<PublicEnrichedClaim>(`/api/claims/${claim.id}`),
        requestScore(claim.id),
      ]);

      return toClaimVerdictView(enrichedClaim, score);
    }),
  );

  return verdicts;
}

async function requestScore(claimId: string): Promise<ScoredClaim> {
  try {
    return await requestJson<ScoredClaim>(`/api/claim/${claimId}/score`, { method: "POST" });
  } catch (error) {
    return requestJson<ScoredClaim>(`/api/claims/${claimId}/score`, { method: "POST" });
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
  }

  return (await response.json()) as T;
}

function toClaimVerdictView(enrichedClaim: PublicEnrichedClaim, score: ScoredClaim): ClaimVerdictView {
  const { account, claim, order, product } = enrichedClaim;
  const riskScore = clampScore(score.riskScore);
  const band = score.band;
  const hardFlags = score.hardFlag ? [score.hardFlag] : [];

  return {
    claim: {
      id: claim.id,
      buyer: account.display_name,
      product: product.name,
      reason: formatReasonCategory(claim.reason_category),
      submittedAt: order.delivery_date,
      claimValue: product.price_sgd,
      riskScore,
      band,
      workflowState: "Unreviewed",
      flags: hardFlags,
      claimText: claim.claim_text,
      productDetails: formatProductDetails(enrichedClaim),
      evidenceImages: getEvidenceImages(enrichedClaim),
    },
    riskScore,
    band,
    hardFlags,
    explanation: score.explanation ?? "No scoring explanation returned for this claim yet.",
    recommendedAction: normalizeRecommendedAction(score.recommendedAction, band),
    signals: score.signals.map(toSignalView),
  };
}

function getEvidenceImages({ claim, product }: PublicEnrichedClaim): EvidenceImage[] {
  const claimImages = claim.images.map((filename, index) => ({
    id: `${claim.id}-claim-${index + 1}`,
    url: `${apiBaseUrl}/api/images/claims/${encodeURIComponent(filename)}`,
    alt: `Claim evidence ${index + 1} for ${claim.id}`,
  }));

  const referenceImage = product.reference_image
    ? [
        {
          id: `${claim.id}-reference`,
          url: `${apiBaseUrl}/api/images/reference/${encodeURIComponent(product.reference_image)}`,
          alt: `Reference image for ${product.name}`,
        },
      ]
    : [];

  return [...claimImages, ...referenceImage];
}

function toSignalView(signal: SignalResult): SignalView {
  return {
    name: signal.name as SignalName,
    risk: signal.risk,
    confidence: signal.confidence,
    confidenceLabel: getConfidenceLabel(signal.confidence),
    evidence: signal.evidence,
    hardFlagTrigger: getHardFlagTrigger(signal.raw),
    details: isRecord(signal.raw) ? signal.raw : undefined,
  };
}

function formatProductDetails({ account, order, product }: PublicEnrichedClaim): string {
  const failureModes = product.typical_failure_modes.join("; ");
  const accountNote = account.profile_note ? ` Account note: ${account.profile_note}.` : "";
  const orderContext =
    order.total_claims_against_order > 1
      ? ` Order ${order.id} has ${order.total_claims_against_order} claims across ${order.items} items.`
      : ` Order ${order.id} has a single claim.`;

  return `${product.category}. ${product.material}. Typical failures: ${failureModes}.${orderContext}${accountNote}`;
}

function normalizeRecommendedAction(action: string | undefined, band: ScoredClaim["band"]): RecommendedAction {
  const normalized = action?.toLowerCase() ?? "";

  if (normalized.includes("escalate")) {
    return "Escalate";
  }

  if (normalized.includes("request")) {
    return "Request evidence";
  }

  if (normalized.includes("release")) {
    return "Release";
  }

  if (band === "High") {
    return "Escalate";
  }

  return band === "Elevated" ? "Request evidence" : "Release";
}

function formatReasonCategory(reasonCategory: PublicClaim["reason_category"]): string {
  const labels: Record<PublicClaim["reason_category"], string> = {
    damaged_or_faulty: "Damaged or faulty",
    wrong_product: "Wrong product",
    incomplete: "Incomplete order",
    not_as_described: "Not as described",
    did_not_receive: "Did not receive",
  };

  return labels[reasonCategory];
}

function getConfidenceLabel(confidence: number): SignalView["confidenceLabel"] {
  if (confidence >= 0.75) {
    return "High confidence";
  }

  if (confidence >= 0.45) {
    return "Medium confidence";
  }

  return "Low confidence";
}

function getHardFlagTrigger(raw: unknown): string | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  return typeof raw.hardFlagTrigger === "string" ? raw.hardFlagTrigger : undefined;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? DEFAULT_DEV_API_BASE_URL : "");
  return env.replace(/\/$/, "");
}
