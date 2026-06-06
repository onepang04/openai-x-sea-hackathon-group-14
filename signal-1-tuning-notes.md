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

## Tuning checklist — run against EVERY scenario before you call it done

- [ ] **C001 — SSL 2 (AI-doctored, radial cracks across the metal faceplate)** → `implausible`,
      confidence > 0.85. Key on the *metal fracturing radially*, not just "a knob broke." This must
      trip the hard flag.
- [ ] **C002 — shirt (AI-doctored believable tear)** → `plausible` or borderline `uncertain`. Signal 1
      alone should NOT convict it; the reference-image match is the decisive catch. If Signal 1 calls
      this confidently implausible you've over-fit.
- [ ] **C003 / C004 — backpack (reused image)** → likely `plausible`; the image-reuse hard flag decides,
      not Signal 1.
- [ ] **C005 — photo frame (REAL shattered glass)** → `plausible`, NOT flagged. The false-positive trap.
      If it trips `implausible`, your prompt is over-eager on dramatic damage — strengthen the
      "severity is not suspicion / glass shatters violently" guidance.
- [ ] **C006 — Calcifer (REAL breakage)** → `plausible`, low risk.

If C005 or C006 land anywhere but Low after aggregation, stop and fix the prompt before touching
anything else — those two are the demo's credibility.
