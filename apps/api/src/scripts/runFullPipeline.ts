import { claims, getEnrichedClaim } from "../data/load";
import { aggregateSignals } from "../scoring/aggregate";
import { scoreClaim } from "../scoring/pipeline";
import type { Band, ScoredClaim, SignalResult } from "../types";

const REQUIRED_SIGNALS = ["ImageReuse", "BehaviouralContext"];
const PLACEHOLDER_PATTERN = /pipeline not implemented|not implemented yet|stub|placeholder/i;

let failures = 0;

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${message}`);
  }
}

function findSignal(scoredClaim: ScoredClaim, name: string): SignalResult | undefined {
  return scoredClaim.signals.find((signal) => signal.name === name);
}

function isBand(value: string | undefined): value is Band {
  return value === "Low" || value === "Elevated" || value === "High";
}

function rawRecord(signal: SignalResult | undefined): Record<string, unknown> {
  return typeof signal?.raw === "object" && signal.raw !== null ? (signal.raw as Record<string, unknown>) : {};
}

function matchedClaimId(signal: SignalResult | undefined): string | null {
  const raw = rawRecord(signal);
  const matched = raw.matched;
  if (typeof matched !== "object" || matched === null) return null;
  const claimId = (matched as Record<string, unknown>).claimId;
  return typeof claimId === "string" ? claimId : null;
}

function minDistance(signal: SignalResult | undefined): number | null {
  const raw = rawRecord(signal);
  return typeof raw.minDistance === "number" ? raw.minDistance : null;
}

function logisticsOverride(signal: SignalResult | undefined): boolean {
  return rawRecord(signal).logisticsOverride === true;
}

function verifyScoredClaim(scoredClaim: ScoredClaim, expectedBand: string | undefined): void {
  assertCondition(Number.isInteger(scoredClaim.riskScore), `${scoredClaim.claimId} riskScore is not an integer`);
  assertCondition(
    scoredClaim.riskScore >= 0 && scoredClaim.riskScore <= 100,
    `${scoredClaim.claimId} riskScore is outside 0..100`,
  );
  assertCondition(
    typeof scoredClaim.explanation === "string" && !PLACEHOLDER_PATTERN.test(scoredClaim.explanation),
    `${scoredClaim.claimId} explanation is missing or still looks like a stub`,
  );

  for (const signalName of REQUIRED_SIGNALS) {
    assertCondition(Boolean(findSignal(scoredClaim, signalName)), `${scoredClaim.claimId} missing ${signalName}`);
  }

  const recomputed = aggregateSignals(scoredClaim.signals);
  assertCondition(
    recomputed.riskScore === scoredClaim.riskScore,
    `${scoredClaim.claimId} aggregation mismatch: expected score ${recomputed.riskScore}, got ${scoredClaim.riskScore}`,
  );
  assertCondition(
    recomputed.band === scoredClaim.band,
    `${scoredClaim.claimId} aggregation mismatch: expected band ${recomputed.band}, got ${scoredClaim.band}`,
  );

  if (scoredClaim.hardFlag) {
    assertCondition(scoredClaim.band === "High", `${scoredClaim.claimId} hard flag did not force High band`);
    assertCondition(scoredClaim.riskScore >= 75, `${scoredClaim.claimId} hard flag score is below 75`);
  }

  if (isBand(expectedBand)) {
    assertCondition(
      scoredClaim.band === expectedBand,
      `${scoredClaim.claimId} expected ${expectedBand}, got ${scoredClaim.band}`,
    );
  }
}

async function main() {
  console.log(`Loaded ${claims.length} claims.`);

  for (const claim of claims) {
    const scoredClaim = await scoreClaim(getEnrichedClaim(claim.id));
    verifyScoredClaim(scoredClaim, claim._dev?.expected_band);

    const imageReuse = findSignal(scoredClaim, "ImageReuse");
    const behavioural = findSignal(scoredClaim, "BehaviouralContext");

    if (claim.id === "C003") {
      assertCondition(scoredClaim.band === "High", "C003 must be High");
      assertCondition(matchedClaimId(imageReuse) === "C004", "C003 must match C004 through ImageReuse");
      assertCondition((minDistance(imageReuse) ?? Number.POSITIVE_INFINITY) < 5, "C003 pHash distance must be <5");
    }

    if (claim.id === "C004") {
      assertCondition(scoredClaim.band === "High", "C004 must be High");
      assertCondition(matchedClaimId(imageReuse) === "C003", "C004 must match C003 through ImageReuse");
      assertCondition((minDistance(imageReuse) ?? Number.POSITIVE_INFINITY) < 5, "C004 pHash distance must be <5");
    }

    if (["C006", "C007", "C008"].includes(claim.id)) {
      assertCondition(logisticsOverride(behavioural), `${claim.id} must apply logistics override`);
    }

    if (claim.id === "C006") {
      assertCondition(scoredClaim.band !== "High", "C006 must not be High");
    }

    console.log(
      `${claim.id} | score=${scoredClaim.riskScore} | band=${scoredClaim.band}` +
        ` | expected=${claim._dev?.expected_band ?? "unknown"}` +
        ` | hardFlag=${scoredClaim.hardFlag ?? "none"}`,
    );
    for (const signal of scoredClaim.signals) {
      console.log(
        `  - ${signal.name}: risk=${signal.risk.toFixed(2)} confidence=${signal.confidence.toFixed(2)} | ${signal.evidence}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} pipeline assertion(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll pipeline assertions passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
