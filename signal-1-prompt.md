# Signal 1 — Visual Claim Integrity prompt (STARTING DRAFT)

> ⚠️ **This is a starting point, not a finished prompt.** The whole reason Signal 1 is the human-owned block is that you must iterate this against your actual mock images and read the outputs. Expect to revise it 5–15 times on the day. Don't treat it as done.

## System prompt

```
You are a claims-integrity analyst for an e-commerce marketplace. You assess whether
a refund claim's photo is consistent with (a) how the product's material physically
fails, and (b) what the buyer says happened. You are evidence-driven and cautious:
you do NOT accuse a claim of fraud just because damage looks unusual, and you do NOT
assume legitimacy just because a photo is clear. Genuine damage can look dramatic;
fabricated damage often violates how materials actually break.

You must reason step by step BEFORE giving a verdict, and you must ground your
verdict in concrete physical expectations for the specific material.
```

## User message (template — fill in per claim)

```
PRODUCT: {product.name}
MATERIAL: {product.material}
EXPECTED FAILURE MODES: {product.typical_failure_modes joined}
BUYER'S CLAIM: "{claim.claim_text}"
REASON CATEGORY: {claim.reason_category}

[image attached]

Do the following in order:
1. Describe what physical damage is actually visible in the image (as a list of observed features).
2. List how this material is expected to fail (use the expected failure modes).
3. Identify any contradictions between the observed damage and expected failure (e.g. cracks with no impact origin, fracture patterns impossible for the material, damage that looks rendered rather than photographed).
4. List plausible *innocent* explanations for anything that looks odd — genuine damage can look dramatic; do not over-accuse.
5. Judge whether the image actually matches the buyer's written claim.
6. Output the structured verdict.
```

## Structured output schema (use response_format: json_schema)

```json
{
  "type": "object",
  "properties": {
    "observed_damage_features": { "type": "array", "items": { "type": "string" } },
    "expected_failure_modes": { "type": "array", "items": { "type": "string" } },
    "contradictions": { "type": "array", "items": { "type": "string" } },
    "alternative_explanations": { "type": "array", "items": { "type": "string" } },
    "physical_plausibility": { "type": "string", "enum": ["plausible", "implausible", "uncertain"] },
    "plausibility_reasoning": { "type": "string" },
    "text_image_match": { "type": "boolean" },
    "mismatches": { "type": "array", "items": { "type": "string" } },
    "confidence": { "type": "number" }
  },
  "required": ["physical_plausibility", "plausibility_reasoning", "text_image_match", "confidence", "contradictions", "alternative_explanations"],
  "additionalProperties": false
}
```

**Why the extra fields:** `contradictions` and `alternative_explanations` force the model to argue *both sides* before its verdict — this is your strongest defence against false positives (it must actively consider the innocent reading) and it makes the reasoning visible so judges can't dismiss it as "the model just vibes." Surface `contradictions` on the verdict card; that's the line that sells the physical-plausibility story.

## Mapping output -> SignalResult

```
plausibility   match   -> risk          confidence
implausible    false   -> 0.85-0.95     use model confidence
implausible    true    -> 0.7-0.85
plausible      false   -> 0.45-0.6      (mismatch is suspicious even if damage is real)
plausible      true    -> 0.05-0.2
uncertain      any     -> 0.4-0.5       cap confidence at 0.5
```
evidence = plausibility_reasoning (+ mismatches if any).
Hard-flag: physical_plausibility == "implausible" AND confidence > 0.85 -> force band High.

## Tuning checklist (run against every mock scenario)

- [ ] C002 (impossible phone crack) → implausible, high confidence
- [ ] C001 (real mug chip) → plausible, low risk
- [ ] C006 (real dramatic glass shatter) → plausible, NOT flagged (false-positive trap holds)
- [ ] C005 (subtle fake tear) → borderline/uncertain (so the *combined* score, not Signal 1 alone, decides)
- [ ] C007/C008 (real logistics damage) → plausible (behavioural override does the rest)

If C006 trips as implausible, your prompt is over-eager — add explicit guidance that dramatic-but-real damage is expected for brittle materials.
