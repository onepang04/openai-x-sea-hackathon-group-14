import type { EnrichedClaim, SignalResult } from "../types";

export interface Signal {
  name: string;
  evaluate(claim: EnrichedClaim): Promise<SignalResult>;
}
