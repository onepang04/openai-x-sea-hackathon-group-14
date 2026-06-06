export type ReasonCategory =
  | "damaged_or_faulty"
  | "wrong_product"
  | "incomplete"
  | "not_as_described"
  | "did_not_receive";

export interface Product {
  id: string;
  name: string;
  category: string;
  material: string;
  typical_failure_modes: string[];
  price_sgd: number;
  reference_image?: string;
}

export interface Account {
  id: string;
  display_name: string;
  account_age_days: number;
  total_orders: number;
  total_refunds: number;
  claims_last_30_days: number;
  profile_note?: string;
}

export interface Order {
  id: string;
  account_id: string;
  delivery_date: string;
  items: number;
  total_claims_against_order: number;
  note?: string;
}

export interface ClaimDevAnnotations {
  scenario_role: string;
  ground_truth: "legitimate" | "fraudulent";
  expected_band: string;
  why: string;
}

export interface Claim {
  id: string;
  account_id: string;
  product_id: string;
  order_id: string;
  reason_category: ReasonCategory;
  claim_text: string;
  images: string[];
  _dev?: ClaimDevAnnotations;
}

export type PublicClaim = Omit<Claim, "_dev">;

export interface EnrichedClaim {
  claim: Claim;
  product: Product;
  account: Account;
  order: Order;
}

export interface PublicEnrichedClaim {
  claim: PublicClaim;
  product: Product;
  account: Account;
  order: Order;
}

export interface SignalResult {
  name: string;
  risk: number;
  confidence: number;
  evidence: string;
  raw?: unknown;
}

export type Band = "Low" | "Elevated" | "High";

export interface ScoredClaim {
  claimId: string;
  riskScore: number;
  band: Band;
  hardFlag: string | null;
  signals: SignalResult[];
  explanation?: string;
  recommendedAction?: string;
}
