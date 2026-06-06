import type { Band, SignalResult } from "../types";

const SIGNAL_WEIGHTS: Record<string, number> = {
  VisualClaimIntegrity: 1.0,
  ImageReuse: 0.9,
  BehaviouralContext: 0.7,
};

export interface AggregatedScore {
  riskScore: number;
  band: Band;
  hardFlag: string | null;
}

export function aggregateSignals(signals: SignalResult[]): AggregatedScore {
  let numerator = 0;
  let denominator = 0;

  for (const signal of signals) {
    const weight = SIGNAL_WEIGHTS[signal.name];
    if (weight === undefined) continue;

    const risk = clamp01(signal.risk);
    const confidence = clamp01(signal.confidence);
    numerator += weight * risk * confidence;
    denominator += weight * confidence;
  }

  const score01 = denominator === 0 ? 0 : numerator / denominator;
  const initialScore = Math.round(clamp01(score01) * 100);
  const hardFlag = findHardFlag(signals);
  const riskScore = hardFlag ? Math.max(initialScore, 75) : initialScore;

  return {
    riskScore,
    band: hardFlag ? "High" : bandForScore(riskScore),
    hardFlag,
  };
}

export function bandForScore(riskScore: number): Band {
  if (riskScore < 30) return "Low";
  if (riskScore <= 65) return "Elevated";
  return "High";
}

function findHardFlag(signals: SignalResult[]): string | null {
  for (const signal of signals) {
    if (SIGNAL_WEIGHTS[signal.name] === undefined) continue;

    const reason = hardFlagReason(signal);
    if (reason) {
      return `${signal.name}: ${reason}`;
    }
  }

  return null;
}

function hardFlagReason(signal: SignalResult): string | null {
  const raw = signal.raw;
  if (!isRecord(raw)) return null;

  if (raw.hardFlag === true) {
    return typeof raw.reason === "string" ? raw.reason : signal.evidence;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
