# Image Manifest — Claim-Integrity Agent (realistic 18-claim active set)

Filenames must match `claims.json` / `products.json` **exactly** (case-sensitive). Ground truth lives
only in `_dev`, never in a filename. 18 active claim images (C018 has two) + 1 reference image.

- Claim images → `data/images/claims/`
- Reference (pristine listing) images → `data/images/reference/`

## Claim images — `data/images/claims/`

| Filename | Claim | Real/fake | Role |
|----------|-------|-----------|------|
| `shirt_black_sleeve_rip.jpg` | C001 | fake | behaviour-only suspicious sleeve rip |
| `visor_lens_scratch.jpg` | C003 | fake | behaviour-only suspicious visor scratch |
| `visor_scratched_wrong_color.jpg` | C004 | real | legit visor scratch + colour mismatch |
| `skincare_jar_cracked_closeup.jpg` | **C005 + C020** | fake | **image-reuse pair** — one file, two accounts |
| `skincare_boxes_cracked.jpg` | C006 | fake | behaviour-only suspicious skincare claim |
| `skincare_packaging_damaged.jpg` | C007 | real | legit skincare packaging damage |
| `mug_print_smudged.jpg` | C009 | real | legit mug print-quality complaint |
| `plastic_container_side_crack.jpg` | C010 | real | **logistics cluster** (1/3, ORD-2010) |
| `plastic_container_lid_crack_closeup.jpg` | C011 | real | **logistics cluster** (2/3, ORD-2010) |
| `plastic_container_lid_crack_blurry.jpg` | C012 | real | **logistics cluster** (3/3, ORD-2010) |
| `glass_frame_shattered_handheld.jpg` | C013 | fake | behaviour-only suspicious glass-frame claim |
| `glass_frame_shattered_packaging.jpg` | C014 | real | legit glass-frame transit damage |
| `usb_hub_port_cracked.jpg` | C015 | fake | behaviour-only suspicious USB hub claim |
| `usb_hub_connector_broken.jpg` | C016 | real | legit USB connector break |
| `monitor_packaging_cracked.jpg` | C017 | fake | behaviour-only suspicious monitor claim |
| `monitor_office_cracked.jpg`, `monitor_desktop_cracked.jpg` | C018 | fake | behaviour-only two-image monitor claim |
| `ssl2_broken.jpg` | C019 | fake | **doctored-from-listing** (edited from `ssl2_intact.jpg`) + implausible metal cracks |

## Reference images — `data/images/reference/`

| Filename | Product | What it shows |
|----------|---------|---------------|
| `ssl2_intact.jpg` | P009 (SSL 2) | Pristine listing photo — the source the C019 fake was doctored from |

P001–P008 have **no** reference image (their claims are genuine photos or behaviour/reuse cases, not doctored-from-listing).

## How the signals fire on this set
- **Signal 1 (visual):** stays calm on the real-damage legits (false-positive anchors); C019 is the active physical-implausibility showcase. Most fraud photos are physically plausible — that's intentional; their conviction comes from Signals 2/3.
- **Signal 2 (pHash):** C005 ↔ C020 share one file → reuse hard flag. C019 (`ssl2_broken.jpg`) is a near-duplicate of `ssl2_intact.jpg` → doctored-from-listing hard flag.
- **Signal 3 (behavioural):** risky accounts raise the behaviour-only frauds to Elevated; the ORD-2010 cluster (3 claims, one shipment) triggers the logistics override → Low.

## Rules of thumb
- Keep format/resolution reasonable; compute pHashes from these files at startup, never hardcode.
- No metadata/EXIF/C2PA tricks — provenance detection is out of scope (see `AGENTS.md`).
- Ground truth lives only in `_dev`; never encode real/fake in a filename.
