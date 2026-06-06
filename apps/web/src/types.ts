export type RiskBand = "Low" | "Elevated" | "High";
export type WorkflowState = "Unreviewed" | "Released" | "Evidence requested" | "Escalated";
export type RecommendedAction = "Release" | "Request evidence" | "Escalate";
export type SignalName = "VisualClaimIntegrity" | "ImageReuse" | "BehaviouralContext";

export interface ReviewerSession {
  id: string;
  displayName: string;
  teamName: string;
  email: string;
}

export interface EvidenceImage {
  id: string;
  url: string;
  alt: string;
}

export interface ClaimQueueItem {
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

export interface SignalView {
  name: SignalName;
  risk: number;
  confidence: number;
  confidenceLabel: "Low confidence" | "Medium confidence" | "High confidence";
  evidence: string;
  hardFlagTrigger?: string;
  details?: Record<string, unknown>;
}

export interface ClaimVerdictView {
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
  recommendedAction: RecommendedAction;
  signals: SignalView[];
}
