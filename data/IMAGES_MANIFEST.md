# Image Manifest — Claim-Integrity Agent (FINAL scenario set)

Place these files in the repo, filenames matching `claims.json` / `products.json` **exactly**
(case-sensitive). 9 files total: 5 claim images + 4 reference images.

- Claim images → `data/images/claims/`
- Reference (pristine listing) images → `data/images/reference/`

## Claim images — `data/images/claims/`

| Filename | Claim | Real or fake | What it shows | Role |
|----------|-------|--------------|---------------|------|
| `ssl2_broken.jpg` | C001 | AI-doctored | SSL 2 interface with radial cracks fanning across the metal faceplate around a snapped knob | Clear fraud — metal doesn't fracture radially; doctored from `ssl2_intact.jpg` |
| `shirt_torn.jpg` | C002 | AI-doctored | Oxford shirt with a believable tear | Ambiguous — the tear looks plausible, so the reference match is the decisive catch |
| `backpack_torn.jpg` | C003 **and** C004 | AI-doctored | Backpack lining tear | The image-reuse pair — **one file, used by two claims/accounts.** Do not make two versions |
| `frame_shattered.jpg` | C005 | **Real** | Genuinely shattered photo-frame glass | False-positive trap — looks dramatic but is real; must land **Low** |
| `calcifer_broken.jpg` | C006 | **Real** | Genuinely broken resin storage tray (pieces, box visible) | Legitimate — real breakage; must land **Low** |

## Reference images — `data/images/reference/`

| Filename | Product | What it shows |
|----------|---------|---------------|
| `ssl2_intact.jpg` | P001 | Pristine SSL 2 (the source the C001 fake was doctored from) |
| `shirt_intact.jpg` | P002 | Pristine shirt listing (source of the C002 fake) |
| `backpack_intact.jpg` | P003 | Pristine backpack (source of the reuse fake) |
| `calcifer_intact.jpg` | P005 | Pristine Calcifer listing — should **not** match the real broken photo; that's the point |

P004 (photo frame) has **no** reference image — the real damage has no doctored source, which is
exactly why the reference signal correctly leaves C005 alone.

## How the signals are meant to fire on this set
- **C001 / C002 / C003-4** were each made by editing the intact reference, so a perceptual-hash
  comparison of claim-vs-reference is the intended catch. C003/C004 reuse the *identical* file across
  two accounts → distance ~0 → hard flag. C001/C002 are doctored-from-reference → small but non-zero
  distance; tune the threshold (`DUP_DISTANCE` 5 / `NEAR_DISTANCE` 8) against your real files.
- **C005 / C006** are genuine separate photos → large distance to everything → no reuse flag → they
  rely on the visual signal rating the damage *plausible* and a clean account → **Low**.

## Rules of thumb
- Keep format/resolution consistent (all JPG, ~1024px) so the pipeline behaves uniformly.
- Compute pHashes from these files **at startup** — never hardcode hashes.
- No metadata/EXIF/C2PA tricks: provenance detection is explicitly out of scope (see `AGENTS.md`).
- Don't "teach to the test" — the fakes should be genuinely hard, not conveniently easy for your prompt.
