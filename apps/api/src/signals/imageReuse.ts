import { dirname, join } from "path";
import { fileURLToPath } from "url";
import imghash from "imghash";
import sharp from "sharp";
import { products } from "../data/load";
import type { Claim, EnrichedClaim, SignalResult } from "../types";
import type { Signal } from "./types";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLAIM_IMAGE_DIR = join(REPO_ROOT, "data", "images", "claims");
const REFERENCE_IMAGE_DIR = join(REPO_ROOT, "data", "images", "reference");

const HARD_FLAG_DISTANCE = 5;
const ELEVATED_DISTANCE = 8;

interface HashEntry {
  kind: "claim" | "reference";
  filename: string;
  hash: string;
  claimId?: string;
  productId?: string;
}

interface Match {
  current: HashEntry;
  matched: HashEntry;
  distance: number;
}

export class ImageReuse implements Signal {
  name = "ImageReuse";

  private indexPromise: Promise<HashEntry[]> | null = null;
  private readonly hashCache = new Map<string, Promise<string>>();

  constructor(private readonly claims: Claim[]) {}

  async evaluate(enrichedClaim: EnrichedClaim): Promise<SignalResult> {
    const index = await this.getIndex();
    const currentEntries = index.filter((entry) => entry.kind === "claim" && entry.claimId === enrichedClaim.claim.id);

    if (currentEntries.length === 0) {
      return {
        name: this.name,
        risk: 0.05,
        confidence: 0.1,
        evidence: "No claim image was available for pHash reuse comparison.",
        raw: { hardFlag: false, matchFound: false, minDistance: null },
      };
    }

    const best = this.findBestMatch(enrichedClaim, currentEntries, index);
    const minDistance = best?.distance ?? null;

    if (best && best.distance < HARD_FLAG_DISTANCE) {
      const reason = this.describeMatch(best, "near-duplicate");
      return {
        name: this.name,
        risk: 0.95,
        confidence: 0.95,
        evidence: `${reason}.`,
        raw: this.buildRaw(best, true, reason),
      };
    }

    if (best && best.distance <= ELEVATED_DISTANCE) {
      const reason = this.describeMatch(best, "similar");
      return {
        name: this.name,
        risk: 0.65,
        confidence: 0.85,
        evidence: `${reason}; below the elevated pHash threshold.`,
        raw: this.buildRaw(best, false, reason),
      };
    }

    return {
      name: this.name,
      risk: 0.05,
      confidence: 0.1,
      evidence:
        minDistance === null
          ? "No comparable claim or reference image was available in the pHash index."
          : `No near-duplicate claim or reference image found; closest pHash distance was ${minDistance}.`,
      raw: {
        hardFlag: false,
        matchFound: false,
        minDistance,
        closestMatch: best ? this.toRawMatch(best.matched, best.distance) : null,
      },
    };
  }

  private getIndex(): Promise<HashEntry[]> {
    this.indexPromise ??= this.buildIndex();
    return this.indexPromise;
  }

  private async buildIndex(): Promise<HashEntry[]> {
    const claimEntries = this.claims.flatMap((claim) =>
      claim.images.map((filename) => ({
        kind: "claim" as const,
        filename,
        claimId: claim.id,
        path: join(CLAIM_IMAGE_DIR, filename),
      })),
    );

    const referenceEntries = products.flatMap((product) => {
      if (!product.reference_image) return [];

      return [
        {
          kind: "reference" as const,
          filename: product.reference_image,
          productId: product.id,
          path: join(REFERENCE_IMAGE_DIR, product.reference_image),
        },
      ];
    });

    return Promise.all(
      [...claimEntries, ...referenceEntries].map(async (entry) => ({
        kind: entry.kind,
        filename: entry.filename,
        claimId: "claimId" in entry ? entry.claimId : undefined,
        productId: "productId" in entry ? entry.productId : undefined,
        hash: await this.hashImage(entry.path),
      })),
    );
  }

  private hashImage(path: string): Promise<string> {
    const cached = this.hashCache.get(path);
    if (cached) return cached;

    const hashPromise = sharp(path)
      .rotate()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .jpeg()
      .toBuffer()
      .then((buffer) => imghash.hash(buffer, 8, "binary"));

    this.hashCache.set(path, hashPromise);
    return hashPromise;
  }

  private findBestMatch(
    enrichedClaim: EnrichedClaim,
    currentEntries: HashEntry[],
    index: HashEntry[],
  ): Match | null {
    let best: Match | null = null;

    for (const current of currentEntries) {
      for (const candidate of index) {
        if (candidate.kind === "claim" && candidate.claimId === enrichedClaim.claim.id) {
          continue;
        }

        const distance = hammingDistance(current.hash, candidate.hash);
        if (!best || distance < best.distance) {
          best = { current, matched: candidate, distance };
        }
      }
    }

    return best;
  }

  private describeMatch(match: Match, adjective: string): string {
    if (match.matched.kind === "reference") {
      return `Claim image is a ${adjective} of product listing photo ${match.matched.filename} (doctored-from-listing), pHash distance ${match.distance}`;
    }

    return `Claim image is a ${adjective} of claim ${match.matched.claimId}, pHash distance ${match.distance}`;
  }

  private buildRaw(match: Match, hardFlag: boolean, reason: string) {
    return {
      hardFlag,
      reason,
      matchFound: true,
      minDistance: match.distance,
      currentImage: match.current.filename,
      matched: this.toRawMatch(match.matched, match.distance),
      thresholds: {
        hardFlagDistance: `<${HARD_FLAG_DISTANCE}`,
        elevatedDistance: `<=${ELEVATED_DISTANCE}`,
      },
    };
  }

  private toRawMatch(entry: HashEntry, distance: number) {
    return {
      kind: entry.kind,
      filename: entry.filename,
      claimId: entry.claimId ?? null,
      productId: entry.productId ?? null,
      sourceId: entry.kind === "claim" ? entry.claimId ?? null : entry.productId ?? null,
      distance,
    };
  }
}

function hammingDistance(left: string, right: string): number {
  const commonLength = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);

  for (let i = 0; i < commonLength; i += 1) {
    if (left[i] !== right[i]) distance += 1;
  }

  return distance;
}
