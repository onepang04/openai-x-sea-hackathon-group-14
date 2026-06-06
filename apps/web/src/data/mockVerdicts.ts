import type { ClaimVerdictView, RecommendedAction, RiskBand, SignalView } from "../types";

const claimImage = (filename: string) => `/evidence/claims/${filename}`;
const referenceImage = (filename: string) => `/evidence/reference/${filename}`;

interface DemoClaimConfig {
  id: string;
  buyer: string;
  product: string;
  reason: string;
  submittedAt: string;
  claimValue: number;
  riskScore: number;
  weightedScore: number;
  band: RiskBand;
  flags: string[];
  claimText: string;
  productDetails: string;
  evidenceImages: Array<{ id: string; url: string; alt: string }>;
  hardFlags: string[];
  explanation: string;
  recommendedAction: RecommendedAction;
  signals: SignalView[];
}

export const mockVerdicts: ClaimVerdictView[] = [
  createVerdict({
    id: "C001",
    buyer: "jielin_home",
    product: "Ralph Lauren Custom Fit Oxford Shirt",
    reason: "Damaged or faulty",
    submittedAt: "2026-06-01T09:10:00+08:00",
    claimValue: 189,
    riskScore: 18,
    weightedScore: 18,
    band: "Low",
    flags: [],
    claimText: "Item sleeve came in with a huge rip along the seam at the wrist section.",
    productDetails:
      "Fashion. 100% cotton oxford cloth with stitched cuffs and seams. Typical failures include tears along stitched seams, fraying at cuffs, and pulled weave around stress points.",
    evidenceImages: [
      {
        id: "C001-main",
        url: claimImage("shirt_seam_tear.jpg"),
        alt: "Oxford shirt sleeve seam tear evidence for claim C001",
      },
    ],
    hardFlags: [],
    explanation:
      "The sleeve tear follows a plausible cotton seam failure pattern and the buyer account is established. Release for standard processing is appropriate.",
    recommendedAction: "Release",
    signals: [
      visualSignal(0.1, 0.86, "plausible", "The tear follows the stitched wrist seam with pulled fabric around the edge.", {
        alternatives: ["A weak stitch line or parcel snag could produce this damage."],
      }),
      imageReuseSignal(0, 0.96, "No near-duplicate image found in the demo evidence set.", 23),
      behaviouralSignal(0.14, "Established buyer with low refund activity.", {
        accountAgeDays: 365,
        claimsLast30Days: 1,
        refundRate: "0.07",
        triggeredRules: [],
      }),
    ],
  }),
  createVerdict({
    id: "C002",
    buyer: "newuser_4471",
    product: "Tinted Motorcycle Helmet Visor",
    reason: "Damaged or faulty",
    submittedAt: "2026-06-02T10:25:00+08:00",
    claimValue: 65,
    riskScore: 47,
    weightedScore: 47,
    band: "Elevated",
    flags: ["New account"],
    claimText: "The visor arrived with a scratch on the lens that blocks vision.",
    productDetails:
      "Automotive Accessories. Tinted polycarbonate lens with anti-scratch coating. Typical failures include surface scratches, edge chips, and cracks from mounting stress.",
    evidenceImages: [
      {
        id: "C002-main",
        url: claimImage("visor_scratched.jpg"),
        alt: "Tinted helmet visor scratch evidence for claim C002",
      },
    ],
    hardFlags: [],
    explanation:
      "The scratch itself is plausible for a visor, but the account is new with early refund activity. Request additional evidence before release.",
    recommendedAction: "Request evidence",
    signals: [
      visualSignal(0.28, 0.62, "plausible", "A surface scratch can occur on coated polycarbonate during handling or transit.", {
        alternatives: ["Packaging abrasion or contact with a hard edge could explain the scratch."],
      }),
      imageReuseSignal(0, 0.94, "No near-duplicate image found in the demo evidence set.", 20),
      behaviouralSignal(0.68, "New account with multiple early claims raises risk.", {
        accountAgeDays: 12,
        claimsLast30Days: 2,
        refundRate: "0.67",
        triggeredRules: ["refund_rate>0.5", "account_age_days<30 and product.price_sgd>=50"],
      }),
    ],
  }),
  createVerdict({
    id: "C003",
    buyer: "quickflip_store",
    product: "Torriden Dive-In Skincare Set",
    reason: "Damaged or faulty",
    submittedAt: "2026-05-28T15:20:00+08:00",
    claimValue: 58,
    riskScore: 88,
    weightedScore: 56,
    band: "High",
    flags: ["Image reuse"],
    claimText: "The black moisturiser jar arrived cracked even though I ordered it new.",
    productDetails:
      "Beauty. Plastic cosmetic jars with sealed lids and cardboard retail packaging. Typical failures include cracked plastic jars, leakage, and crushed retail packaging.",
    evidenceImages: [
      {
        id: "C003-main",
        url: claimImage("skincare_jar_cracked.jpg"),
        alt: "Skincare jar crack evidence for claim C003",
      },
    ],
    hardFlags: ["ImageReuse: near-duplicate evidence image with claim C004"],
    explanation:
      "The same skincare evidence image is used by another buyer account. Escalate this claim because the reuse hard flag outweighs the otherwise plausible plastic damage.",
    recommendedAction: "Escalate",
    signals: [
      visualSignal(0.38, 0.58, "uncertain", "Cracked plastic packaging is plausible, but the image alone is not decisive.", {
        alternatives: ["Parcel compression could crack a plastic jar or lid."],
      }),
      imageReuseSignal(0.95, 0.96, "Near-duplicate evidence image found against claim C004 with pHash distance 0.", 0, {
        matchingClaimId: "C004",
        hardFlagTrigger: "pHash distance <= 5",
        matchedPriorEvidence: {
          id: "C004-match",
          url: claimImage("skincare_jar_cracked.jpg"),
          alt: "Matched skincare evidence for claim C004",
        },
      }),
      behaviouralSignal(0.7, "High refund rate and recent claim velocity were triggered.", {
        accountAgeDays: 47,
        claimsLast30Days: 3,
        refundRate: "0.67",
        triggeredRules: ["refund_rate>0.5", "claims_last_30_days>=3"],
      }),
    ],
  }),
  createVerdict({
    id: "C004",
    buyer: "deals_hunter88",
    product: "Torriden Dive-In Skincare Set",
    reason: "Damaged or faulty",
    submittedAt: "2026-05-29T12:35:00+08:00",
    claimValue: 58,
    riskScore: 87,
    weightedScore: 55,
    band: "High",
    flags: ["Image reuse"],
    claimText: "The moisturiser came cracked on arrival and I need a refund.",
    productDetails:
      "Beauty. Plastic cosmetic jars with sealed lids and cardboard retail packaging. Typical failures include cracked plastic jars, leakage, and crushed retail packaging.",
    evidenceImages: [
      {
        id: "C004-main",
        url: claimImage("skincare_jar_cracked.jpg"),
        alt: "Skincare jar crack evidence for claim C004",
      },
    ],
    hardFlags: ["ImageReuse: near-duplicate evidence image with claim C003"],
    explanation:
      "This claim reuses the same skincare photo as C003 from a different account. Escalation is recommended for seller review.",
    recommendedAction: "Escalate",
    signals: [
      visualSignal(0.36, 0.6, "uncertain", "The jar crack is possible for compressed plastic packaging.", {
        alternatives: ["A crushed parcel could explain the visible crack."],
      }),
      imageReuseSignal(0.95, 0.96, "Near-duplicate evidence image found against claim C003 with pHash distance 0.", 0, {
        matchingClaimId: "C003",
        hardFlagTrigger: "pHash distance <= 5",
        matchedPriorEvidence: {
          id: "C003-match",
          url: claimImage("skincare_jar_cracked.jpg"),
          alt: "Matched skincare evidence for claim C003",
        },
      }),
      behaviouralSignal(0.78, "Serial refund behaviour and recent claim velocity were triggered.", {
        accountAgeDays: 182,
        claimsLast30Days: 4,
        refundRate: "0.60",
        triggeredRules: ["refund_rate>0.5", "claims_last_30_days>=3"],
      }),
    ],
  }),
  createVerdict({
    id: "C005",
    buyer: "flashbuyer_221",
    product: "Custom Ceramic Photo Mug",
    reason: "Damaged or faulty",
    submittedAt: "2026-06-03T16:45:00+08:00",
    claimValue: 16,
    riskScore: 76,
    weightedScore: 76,
    band: "High",
    flags: ["Text-image mismatch", "Risky account"],
    claimText: "The mug has huge cracks at the bottom part and arrived in poor condition.",
    productDetails:
      "Home & Living. Glazed ceramic mug with printed polymer transfer. Typical failures include rim chips, impact cracks, thermal cracks, and handle fractures.",
    evidenceImages: [
      {
        id: "C005-main",
        url: claimImage("mug_cracked.jpg"),
        alt: "Ceramic mug crack evidence for claim C005",
      },
    ],
    hardFlags: [],
    explanation:
      "Ceramic cracking is physically possible, but the image does not support the buyer's bottom-damage description and the account has high recent refund velocity. Escalate for seller review.",
    recommendedAction: "Escalate",
    signals: [
      visualSignal(0.76, 0.78, "uncertain", "The visible side cracking does not match the claim text describing bottom damage.", {
        mismatches: ["Buyer says bottom damage, while the evidence image shows visible side cracks."],
        textImageMatch: false,
      }),
      imageReuseSignal(0.04, 0.94, "No near-duplicate image found in the demo evidence set.", 19),
      behaviouralSignal(0.86, "High refund rate and recent claim velocity were triggered.", {
        accountAgeDays: 22,
        claimsLast30Days: 3,
        refundRate: "0.60",
        triggeredRules: ["refund_rate>0.5", "claims_last_30_days>=3"],
      }),
    ],
  }),
  createVerdict({
    id: "C006",
    buyer: "ahmad_collects",
    product: "A4 Glass Photo Frame",
    reason: "Damaged or faulty",
    submittedAt: "2026-06-04T11:05:00+08:00",
    claimValue: 18,
    riskScore: 14,
    weightedScore: 14,
    band: "Low",
    flags: ["Logistics incident"],
    claimText: "Received my glass photo frame completely shattered, with large cracks and loose fragments inside the packaging.",
    productDetails:
      "Home & Living. Glass pane in a synthetic leather frame. Typical failures include radiating glass cracks, loose fragments, and chipped frame corners.",
    evidenceImages: [
      {
        id: "C006-main",
        url: claimImage("glass_frame_shattered.jpg"),
        alt: "Shattered glass photo frame evidence for claim C006",
      },
    ],
    hardFlags: [],
    explanation:
      "The dramatic shatter pattern is plausible for glass, and C006-C008 share one order as a logistics cluster. Release for standard processing.",
    recommendedAction: "Release",
    signals: [
      visualSignal(0.1, 0.88, "plausible", "Irregular cracks and loose fragments are consistent with brittle glass failure.", {
        alternatives: ["Parcel impact or compression could produce this shatter pattern."],
      }),
      imageReuseSignal(0, 0.96, "No near-duplicate image found in the demo evidence set.", 22),
      behaviouralSignal(0.12, "Shared order detected; logistics-incident override lowered behavioural risk.", {
        accountAgeDays: 600,
        claimsLast30Days: 3,
        refundRate: "0.08",
        triggeredRules: ["claims_last_30_days>=3", "order.total_claims_against_order>=3"],
        override: "C006, C007, and C008 share ORD-1006, suggesting parcel-level transit damage.",
      }),
    ],
  }),
  createVerdict({
    id: "C007",
    buyer: "ahmad_collects",
    product: "Vention 4-Port USB Hub",
    reason: "Damaged or faulty",
    submittedAt: "2026-06-04T11:08:00+08:00",
    claimValue: 25,
    riskScore: 18,
    weightedScore: 18,
    band: "Low",
    flags: ["Logistics incident"],
    claimText: "The USB hub connector broke before any use and the product arrived unusable.",
    productDetails:
      "Electronics. Plastic and aluminium hub casing with USB-A ports and rubberized cable. Typical failures include detached USB connector shells and cable strain damage.",
    evidenceImages: [
      {
        id: "C007-main",
        url: claimImage("usb_hub_broken.jpg"),
        alt: "USB hub connector damage evidence for claim C007",
      },
    ],
    hardFlags: [],
    explanation:
      "The connector damage is plausible transit damage and belongs to the same shared-order logistics incident as C006 and C008. Release for standard processing.",
    recommendedAction: "Release",
    signals: [
      visualSignal(0.16, 0.74, "plausible", "Connector detachment is a normal failure mode for cable strain or parcel compression.", {
        alternatives: ["Cable strain during shipping could detach the connector shell."],
      }),
      imageReuseSignal(0, 0.96, "No near-duplicate image found in the demo evidence set.", 24),
      behaviouralSignal(0.14, "Shared order detected; logistics-incident override lowered behavioural risk.", {
        accountAgeDays: 600,
        claimsLast30Days: 3,
        refundRate: "0.08",
        triggeredRules: ["claims_last_30_days>=3", "order.total_claims_against_order>=3"],
        override: "C006, C007, and C008 share ORD-1006, suggesting parcel-level transit damage.",
      }),
    ],
  }),
  createVerdict({
    id: "C008",
    buyer: "ahmad_collects",
    product: "Acer KA2 27-inch IPS Monitor",
    reason: "Damaged or faulty",
    submittedAt: "2026-06-04T11:11:00+08:00",
    claimValue: 189,
    riskScore: 21,
    weightedScore: 21,
    band: "Low",
    flags: ["Logistics incident"],
    claimText: "The Acer monitor screen was already cracked when opened, with display damage straight out of the box.",
    productDetails:
      "Electronics. LCD glass panel with plastic housing and metal stand. Typical failures include LCD panel cracks, pressure damage, and housing fractures during transit.",
    evidenceImages: [
      {
        id: "C008-main",
        url: claimImage("monitor_cracked.jpg"),
        alt: "Cracked Acer monitor evidence for claim C008",
      },
    ],
    hardFlags: [],
    explanation:
      "The cracked LCD is plausible transit damage, and the shared order context points to a logistics incident instead of buyer-level escalation.",
    recommendedAction: "Release",
    signals: [
      visualSignal(0.22, 0.7, "plausible", "LCD panel cracks and display artifacts can result from transit impact or torsion.", {
        alternatives: ["Pressure during shipping could crack the LCD panel."],
      }),
      imageReuseSignal(0, 0.95, "No near-duplicate image found in the demo evidence set.", 26),
      behaviouralSignal(0.16, "Shared order detected; logistics-incident override lowered behavioural risk.", {
        accountAgeDays: 600,
        claimsLast30Days: 3,
        refundRate: "0.08",
        triggeredRules: ["claims_last_30_days>=3", "order.total_claims_against_order>=3"],
        override: "C006, C007, and C008 share ORD-1006, suggesting parcel-level transit damage.",
      }),
    ],
  }),
  createVerdict({
    id: "C009",
    buyer: "flashbuyer_221",
    product: "Solid State Logic SSL 2 USB Audio Interface",
    reason: "Damaged or faulty",
    submittedAt: "2026-06-05T13:40:00+08:00",
    claimValue: 399,
    riskScore: 92,
    weightedScore: 83,
    band: "High",
    flags: ["Physical implausibility", "Reference match"],
    claimText: "The audio interface arrived with the monitor knob snapped off and cracks spreading across the top panel.",
    productDetails:
      "Audio. Aluminium chassis with plastic control knobs. Typical failures include cracked knobs, scuffs or dents on the metal faceplate, and bent rear I/O connectors.",
    evidenceImages: [
      {
        id: "C009-main",
        url: claimImage("ssl2_broken.jpg"),
        alt: "Broken SSL 2 audio interface evidence for claim C009",
      },
      {
        id: "C009-reference",
        url: referenceImage("ssl2_intact.jpg"),
        alt: "Reference image for intact SSL 2 audio interface",
      },
    ],
    hardFlags: [
      "VisualClaimIntegrity: high-confidence physical implausibility",
      "ImageReuse: claim image matches product reference source",
    ],
    explanation:
      "The metal faceplate appears to fracture radially, which is not a credible aluminium failure mode, and the image also resembles the listing reference. Escalate for investigation.",
    recommendedAction: "Escalate",
    signals: [
      visualSignal(0.94, 0.92, "implausible", "Aluminium should dent, scuff, or bend rather than fracture in radial crack lines across the faceplate.", {
        contradictions: ["Radial cracks spread across metal instead of showing dents, bends, or scuffs."],
        hardFlagTrigger: "physical_plausibility=implausible and confidence>0.85",
      }),
      imageReuseSignal(0.92, 0.94, "Claim image closely matches the product reference image for P005.", 3, {
        matchingClaimId: "reference:P005",
        hardFlagTrigger: "pHash distance <= 5",
      }),
      behaviouralSignal(0.86, "High refund rate, recent claim velocity, and a new high-value claim were triggered.", {
        accountAgeDays: 22,
        claimsLast30Days: 3,
        refundRate: "0.60",
        triggeredRules: ["refund_rate>0.5", "claims_last_30_days>=3", "account_age_days<30 and product.price_sgd>=50"],
      }),
    ],
  }),
];

function createVerdict(config: DemoClaimConfig): ClaimVerdictView {
  return {
    claim: {
      id: config.id,
      buyer: config.buyer,
      product: config.product,
      reason: config.reason,
      submittedAt: config.submittedAt,
      claimValue: config.claimValue,
      riskScore: config.riskScore,
      band: config.band,
      workflowState: "Unreviewed",
      flags: config.flags,
      claimText: config.claimText,
      productDetails: config.productDetails,
      evidenceImages: config.evidenceImages,
    },
    riskScore: config.riskScore,
    weightedScore: config.weightedScore,
    band: config.band,
    hardFlags: config.hardFlags,
    explanation: config.explanation,
    recommendedAction: config.recommendedAction,
    signals: config.signals,
  };
}

function visualSignal(
  risk: number,
  confidence: number,
  physicalPlausibility: "plausible" | "implausible" | "uncertain",
  evidence: string,
  options: {
    alternatives?: string[];
    contradictions?: string[];
    hardFlagTrigger?: string;
    mismatches?: string[];
    textImageMatch?: boolean;
  } = {},
): SignalView {
  return {
    name: "VisualClaimIntegrity",
    risk,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    evidence,
    hardFlagTrigger: options.hardFlagTrigger,
    details: {
      physicalPlausibility,
      plausibilityReasoning: evidence,
      contradictions: options.contradictions ?? [],
      alternativeExplanations: options.alternatives ?? [],
      textImageMatch: options.textImageMatch ?? true,
      mismatches: options.mismatches ?? [],
    },
  };
}

function imageReuseSignal(
  risk: number,
  confidence: number,
  evidence: string,
  pHashDistance: number,
  options: {
    hardFlagTrigger?: string;
    matchedPriorEvidence?: { id: string; url: string; alt: string };
    matchingClaimId?: string;
  } = {},
): SignalView {
  return {
    name: "ImageReuse",
    risk,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    evidence,
    hardFlagTrigger: options.hardFlagTrigger,
    details: {
      matchFound: Boolean(options.matchingClaimId),
      matchingClaimId: options.matchingClaimId,
      pHashDistance,
      matchedPriorEvidence: options.matchedPriorEvidence,
    },
  };
}

function behaviouralSignal(
  risk: number,
  evidence: string,
  details: {
    accountAgeDays: number;
    claimsLast30Days: number;
    refundRate: string;
    triggeredRules: string[];
    override?: string;
  },
): SignalView {
  return {
    name: "BehaviouralContext",
    risk,
    confidence: 0.7,
    confidenceLabel: "Medium confidence",
    evidence,
    details,
  };
}

function confidenceLabel(confidence: number): SignalView["confidenceLabel"] {
  if (confidence >= 0.75) {
    return "High confidence";
  }

  if (confidence >= 0.45) {
    return "Medium confidence";
  }

  return "Low confidence";
}
