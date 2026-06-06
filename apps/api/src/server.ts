import { config as loadEnv } from "dotenv";
import cors from "cors";
import express from "express";
import { join } from "path";
import { DATA_DIR, claims, getEnrichedClaim, sanitizeClaim, toPublicEnrichedClaim } from "./data/load";
import { scoreClaim } from "./scoring/pipeline";
import type { PublicEnrichedClaim, ScoredClaim } from "./types";

// The workspace runs with cwd apps/api, so load the repo-root .env explicitly
// (OPENAI_API_KEY + OPENAI_VISION_MODEL for the Signal 1 vision call).
loadEnv({ path: join(DATA_DIR, "..", ".env") });

const app = express();
let verdictCache: ApiClaimVerdict[] | null = null;
let verdictCachePromise: Promise<ApiClaimVerdict[]> | null = null;

interface ApiClaimVerdict {
  enrichedClaim: PublicEnrichedClaim;
  score: ScoredClaim;
}

app.use(cors());
app.use(express.json());
app.use("/api/images/claims", express.static(join(DATA_DIR, "images/claims")));
app.use("/api/images/reference", express.static(join(DATA_DIR, "images/reference")));

app.get("/api/claims", (_req, res) => {
  res.json(claims.map(sanitizeClaim));
});

app.get("/api/claims/:id", (req, res) => {
  try {
    const enrichedClaim = getEnrichedClaim(req.params.id);
    res.json(toPublicEnrichedClaim(enrichedClaim));
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

app.get("/api/verdicts", async (_req, res) => {
  try {
    const verdicts = await getVerdicts();
    res.json(verdicts);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/verdicts/stream", async (req, res) => {
  const refresh = req.query.refresh === "1";

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");

  let isClosed = false;
  req.on("close", () => {
    isClosed = true;
  });

  const writeEvent = (event: VerdictStreamEvent) => {
    if (!isClosed) {
      res.write(`${JSON.stringify(event)}\n`);
    }
  };

  try {
    if (!refresh && verdictCache) {
      streamCachedVerdicts(verdictCache, writeEvent);
      res.end();
      return;
    }

    writeEvent({ type: "start", total: claims.length, completed: 0, cached: false });

    const verdicts = await getVerdicts(refresh, (verdict, completed) => {
      writeEvent({ type: "verdict", total: claims.length, completed, cached: false, verdict });
    });

    writeEvent({ type: "end", total: verdicts.length, completed: verdicts.length, cached: false });
    res.end();
  } catch (error) {
    writeEvent({ type: "error", message: (error as Error).message });
    res.end();
  }
});

async function scoreClaimHandler(req: express.Request, res: express.Response) {
  try {
    const enrichedClaim = getEnrichedClaim(req.params.id);
    res.json(await scoreClaim(enrichedClaim));
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
}

app.post("/api/seller/login", (req, res) => {
  const requestedEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const email = requestedEmail.includes("@") ? requestedEmail : "seller@demo.local";

  res.json({
    id: "seller-demo",
    displayName: "Demo Seller",
    shopName: "Northstar Devices",
    email,
  });
});

app.post("/api/claims/:id/score", scoreClaimHandler);
app.post("/api/claim/:id/score", scoreClaimHandler);

const port = process.env.PORT ?? "3000";

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

type VerdictProgressHandler = (verdict: ApiClaimVerdict, completed: number) => void;

type VerdictStreamEvent =
  | { type: "start"; total: number; completed: number; cached: boolean }
  | { type: "verdict"; total: number; completed: number; cached: boolean; verdict: ApiClaimVerdict }
  | { type: "end"; total: number; completed: number; cached: boolean }
  | { type: "error"; message: string };

function getVerdicts(refresh = false, onProgress?: VerdictProgressHandler): Promise<ApiClaimVerdict[]> {
  if (!refresh && verdictCache) {
    return Promise.resolve(verdictCache);
  }

  if (!refresh && verdictCachePromise && !onProgress) {
    return verdictCachePromise;
  }

  if (!refresh && verdictCachePromise && onProgress) {
    return verdictCachePromise.then((verdicts) => {
      streamCachedVerdicts(verdicts, (event) => {
        if (event.type === "verdict") {
          onProgress(event.verdict, event.completed);
        }
      });
      return verdicts;
    });
  }

  verdictCachePromise = scoreVerdicts(onProgress)
    .then((verdicts) => {
      verdictCache = verdicts;
      return verdicts;
    })
    .finally(() => {
      verdictCachePromise = null;
    });

  return verdictCachePromise;
}

async function scoreVerdicts(onProgress?: VerdictProgressHandler): Promise<ApiClaimVerdict[]> {
  const completedVerdicts = new Array<ApiClaimVerdict>(claims.length);
  let completed = 0;

  await Promise.all(
    claims.map(async (claim, index) => {
      const enrichedClaim = getEnrichedClaim(claim.id);
      const verdict = {
        enrichedClaim: toPublicEnrichedClaim(enrichedClaim),
        score: await scoreClaim(enrichedClaim),
      };

      completedVerdicts[index] = verdict;
      completed += 1;
      onProgress?.(verdict, completed);
    }),
  );

  return completedVerdicts;
}

function streamCachedVerdicts(
  verdicts: ApiClaimVerdict[],
  writeEvent: (event: VerdictStreamEvent) => void,
) {
  writeEvent({ type: "start", total: verdicts.length, completed: 0, cached: true });

  verdicts.forEach((verdict, index) => {
    writeEvent({ type: "verdict", total: verdicts.length, completed: index + 1, cached: true, verdict });
  });

  writeEvent({ type: "end", total: verdicts.length, completed: verdicts.length, cached: true });
}
