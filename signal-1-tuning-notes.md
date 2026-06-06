# Signal 1 — Tuning Notes (human reference, NOT loaded by code)

The loadable system prompt is `signal-1-prompt.md` — that's the only file the code reads.
This file holds everything around it: how the per-claim user message is assembled, the output
schema the code enforces, the risk mapping, and the tuning checklist. **Tune `signal-1-prompt.md`
against the real images tonight; use the checklist below to know when it's good enough.**

## Per-claim user message (built in code from the EnrichedClaim — do NOT hardcode)

```
PRODUCT: {product.name}
MATERIAL: {product.material}
EXPECTED FAILURE MODES: {product.typical_failure_modes joined}
BUYER'S CLAIM: "{claim.claim_text}"
REASON CATEGORY: {claim.reason_category}

[claim image(s) attached]
```

## Output schema (enforce via response_format: json_schema)

```json
{
  "type": "object",
  "properties": {
    "observed_damage_features":  { "type": "array", "items": { "type": "string" } },
    "expected_failure_modes":    { "type": "array", "items": { "type": "string" } },
    "contradictions":            { "type": "array", "items": { "type": "string" } },
    "alternative_explanations":  { "type": "array", "items": { "type": "string" } },
    "physical_plausibility":     { "type": "string", "enum": ["plausible", "implausible", "uncertain"] },
    "plausibility_reasoning":    { "type": "string" },
    "text_image_match":          { "type": "boolean" },
    "mismatches":                { "type": "array", "items": { "type": "string" } },
    "confidence":                { "type": "number" }
  },
  "required": ["physical_plausibility", "plausibility_reasoning", "text_image_match",
               "confidence", "contradictions", "alternative_explanations"],
  "additionalProperties": false
}
```

`contradictions` and `alternative_explanations` force the model to argue both sides before its
verdict — the strongest defence against false positives, and the reasoning judges can actually read.
Surface `contradictions` on the verdict card.

## Output → SignalResult mapping

```
plausibility   match   -> risk        confidence
implausible    false   -> 0.85-0.95   use model confidence
implausible    true    -> 0.70-0.85
plausible      false   -> 0.45-0.60   (a mismatch is suspicious even if the damage is real)
plausible      true    -> 0.05-0.20
uncertain      any     -> 0.40-0.50   cap confidence at 0.5
```
`evidence` = `plausibility_reasoning` (+ `mismatches` if any).
Hard-flag: `physical_plausibility == "implausible"` AND `confidence > 0.85` → forces band High.

## Tuning checklist — run against every active scenario before you call it done

`C002` and `C008` are excluded from the active demo/eval set because they produced ambiguous findings for
the current problem statement. Do not tune the prompt around them.

- [ ] **Active legitimate claims (C004, C007, C009, C010, C011, C012, C014, C016)** → `plausible`,
      `text_image_match=true`, no hard flag. Severity alone is not suspicion.
- [ ] **Behaviour-only frauds (C001, C003, C006, C013, C015, C017, C018)** → no Signal 1 hard flag.
      Their conviction comes from BehaviouralContext, so Signal 1 should stay calibrated.
- [ ] **Image-reuse pair (C005 + C020)** → no Signal 1 hard flag. The same evidence image is owned by
      ImageReuse, not visual plausibility.
- [ ] **Logistics cluster (C010/C011/C012)** → plausible plastic damage. Aggregation should land Low
      because BehaviouralContext applies the shared-order override.
- [ ] **C019 — SSL 2 doctored-from-listing** → acceptable Signal 1 outcomes are either a strong
      physical-implausibility flag for radial metal cracks or a non-gating result; the hard conviction
      comes from the Signal 2 reference match against `ssl2_intact.jpg`.

If any active legitimate claim or the logistics cluster lands above Low after aggregation, stop and fix
the prompt/scoring before touching anything else. Those cases are the demo's credibility.
