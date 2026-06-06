# Image Manifest — what to create before 6 June

The JSON data is ready, but **images can't be auto-generated for you.** Source or generate each file below and drop it in `mock-data/images/`. Filenames must match the `images` field in `claims.json` exactly.

7 unique images (one is reused across two claims).

| Filename | Type | What it shows | How to get it | Special notes |
|----------|------|---------------|---------------|---------------|
| `C001_mug_chip.jpg` | **Real** | A ceramic mug with a small chip on the rim | Phone photo of a real chipped mug, or free stock | Damage should look mundane and plausible |
| `C002_phone_fake_crack.jpg` | **AI-generated** | A phone screen with a physically *impossible* crack — radial spider pattern from the dead centre, no impact origin | Generate with an image model | Leave C2PA metadata intact → this is your "easy catch" demo case |
| `shared_fake_01.jpg` | **AI-generated** | A cracked earbuds case | Generate once | **Used by BOTH C003 and C004** — this is the image-reuse pair. Do not create two versions |
| `C005_shirt_fake_tear.jpg` | **AI-generated** | A t-shirt with a tear that looks *believable* (along/near a seam, subtle) | Generate, then refine for realism | **STRIP C2PA / metadata** — this is the hard ambiguous case; it must not be trivially caught by provenance |
| `C006_glass_real_shatter.jpg` | **Real** | A genuinely shattered glass bottle, dramatic but real | Real photo or free stock of broken glass | The false-positive trap — should *look* alarming but be real |
| `C007_phone_logistics.jpg` | **Real** | A phone with real transit damage | Real photo or stock | Part of the logistics-incident set |
| `C008_mug_logistics.jpg` | **Real** | A mug with real transit damage | Real photo or stock | Part of the logistics-incident set |

## Rules of thumb
- **Don't teach to the test.** The AI fakes (esp. `C005`) should be genuinely hard, not conveniently easy for your own prompt.
- **Keep resolution/format consistent** (e.g. all JPG, ~1024px) so the pipeline behaves uniformly.
- **Compute pHashes at startup** from these files — don't hardcode hashes.
- If you generate fakes with an OpenAI image model, remember it stamps C2PA by default. Keep it on `C002` (easy case), strip it on `C005` (hard case).
