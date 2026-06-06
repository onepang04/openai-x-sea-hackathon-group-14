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

    // Image-reuse pair: C005 and C020 share the same claim photo across two accounts.
    if (claim.id === "C005") {
      assertCondition(scoredClaim.band === "High", "C005 must be High (image reuse)");
      assertCondition(matchedClaimId(imageReuse) === "C020", "C005 must match C020 through ImageReuse");
      assertCondition((minDistance(imageReuse) ?? Number.POSITIVE_INFINITY) < 5, "C005 pHash distance must be <5");
    }

    if (claim.id === "C020") {
      assertCondition(scoredClaim.band === "High", "C020 must be High (image reuse)");
      assertCondition(matchedClaimId(imageReuse) === "C005", "C020 must match C005 through ImageReuse");
      assertCondition((minDistance(imageReuse) ?? Number.POSITIVE_INFINITY) < 5, "C020 pHash distance must be <5");
    }

    // Doctored-from-listing: C019's claim photo is edited from product P009's reference image.
    if (claim.id === "C019") {
      assertCondition(scoredClaim.band === "High", "C019 must be High (doctored-from-listing)");
      assertCondition(Boolean(scoredClaim.hardFlag), "C019 must hard-flag via reference match");
      assertCondition((minDistance(imageReuse) ?? Number.POSITIVE_INFINITY) < 5, "C019 reference pHash distance must be <5");
    }

    // Logistics cluster: C010-C012 share one order (ORD-2010); the override pulls the cluster to Low.
    if (["C010", "C011", "C012"].includes(claim.id)) {
      assertCondition(logisticsOverride(behavioural), `${claim.id} must apply logistics override`);
      assertCondition(scoredClaim.band === "Low", `${claim.id} logistics cluster must be Low`);
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
