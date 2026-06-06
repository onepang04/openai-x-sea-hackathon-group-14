import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type {
  Account,
  Claim,
  EnrichedClaim,
  Order,
  Product,
  PublicClaim,
  PublicEnrichedClaim,
} from "../types";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../..", "data");

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), "utf-8")) as T;
}

export const products: Product[] = readJson<Product[]>("products.json");
export const accounts: Account[] = readJson<Account[]>("accounts.json");
export const orders: Order[] = readJson<Order[]>("orders.json");
export const claims: Claim[] = readJson<Claim[]>("claims.json");

function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

const productsById = indexById(products);
const accountsById = indexById(accounts);
const ordersById = indexById(orders);

export function sanitizeClaim(claim: Claim): PublicClaim {
  const { _dev, ...publicClaim } = claim;
  return publicClaim;
}

export function getEnrichedClaim(claimId: string): EnrichedClaim {
  const claim = claims.find((candidate) => candidate.id === claimId);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  const product = productsById.get(claim.product_id);
  const account = accountsById.get(claim.account_id);
  const order = ordersById.get(claim.order_id);

  if (!product || !account || !order) {
    throw new Error(`Missing related record for claim ${claimId}`);
  }

  return { claim, product, account, order };
}

export function toPublicEnrichedClaim(enrichedClaim: EnrichedClaim): PublicEnrichedClaim {
  return {
    claim: sanitizeClaim(enrichedClaim.claim),
    product: enrichedClaim.product,
    account: enrichedClaim.account,
    order: enrichedClaim.order,
  };
}
