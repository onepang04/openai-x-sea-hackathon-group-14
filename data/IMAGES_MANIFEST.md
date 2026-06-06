# Image Manifest - Claim-Integrity Agent

Final active image set for the demo dataset. Filenames must match `claims.json` and
`products.json` exactly.

- Claim images: `data/images/claims/`
- Reference images: `data/images/reference/`

## Claim Images

| Filename | Claim | Product | Real or fake | What it shows | Role |
|----------|-------|---------|--------------|---------------|------|
| `shirt_seam_tear.jpg` | C001 | P001 | Real damage | Oxford shirt sleeve torn along the wrist seam | Legitimate low-risk apparel damage |
| `visor_scratched.jpg` | C002 | P002 | AI-doctored | Tinted visor with a visible lens scratch | Suspicious new-account claim; behavioural rules raise risk |
| `skincare_jar_cracked.jpg` | C003 and C004 | P003 | AI-doctored | Torriden skincare jar with cracking on the plastic container | Image-reuse pair; one file reused across two accounts |
| `mug_cracked.jpg` | C005 | P004 | AI-doctored | Ceramic photo mug with visible cracking on the side | Text-image mismatch plus risky account behaviour |
| `glass_frame_shattered.jpg` | C006 | P006 | Real damage | A4 glass photo frame shattered inside the frame | Logistics-incident cluster; physical damage is plausible |
| `usb_hub_broken.jpg` | C007 | P007 | Real damage | USB hub connector detached from the cable | Logistics-incident cluster; plausible transit damage |
| `monitor_cracked.jpg` | C008 | P008 | Real damage | Acer monitor with cracked LCD panel and display damage | Logistics-incident cluster; plausible transit damage |
| `ssl2_broken.jpg` | C009 | P005 | AI-doctored | SSL 2 audio interface with radial cracks across an aluminium faceplate | Physical-implausibility hero case; High hard-flag candidate |

## Reference Images

| Filename | Product | What it shows | Role |
|----------|---------|---------------|------|
| `ssl2_intact.jpg` | P005 | Pristine SSL 2 audio interface listing photo | Reference source for the doctored SSL 2 claim image |

## Signal Expectations

- C009 is the physical-implausibility hero case: aluminium should dent, scuff, or bend rather
  than fracture radially across the faceplate.
- C003 and C004 share `skincare_jar_cracked.jpg`, so ImageReuse should hard-flag the duplicate.
- C006, C007, and C008 share `ORD-1006` with `total_claims_against_order: 3`, so Behavioural
  Context should lower risk as a likely logistics incident.
- Products without a pristine doctored source intentionally have no `reference_image` field.
