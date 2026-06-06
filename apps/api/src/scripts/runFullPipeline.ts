import { claims } from "../data/load";

console.log(`Loaded ${claims.length} claims.`);

for (const claim of claims) {
  console.log(`${claim.id} | expected: ${claim._dev?.expected_band ?? "unknown"} | pipeline not implemented yet`);
}
