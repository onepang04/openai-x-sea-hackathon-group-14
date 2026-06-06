import { config as loadEnv } from "dotenv";
import cors from "cors";
import express from "express";
import { join } from "path";
import { DATA_DIR, claims, getEnrichedClaim, sanitizeClaim, toPublicEnrichedClaim } from "./data/load";
import { scoreClaimStub } from "./scoring/stub";

// The workspace runs with cwd apps/api, so load the repo-root .env explicitly
// (OPENAI_API_KEY + OPENAI_VISION_MODEL for the Signal 1 vision call).
loadEnv({ path: join(DATA_DIR, "..", ".env") });

const app = express();

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

async function scoreClaim(req: express.Request, res: express.Response) {
  try {
    const enrichedClaim = getEnrichedClaim(req.params.id);
    res.json(await scoreClaimStub(enrichedClaim, claims));
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
}

app.post("/api/claim/:id/score", scoreClaim);
app.post("/api/claims/:id/score", scoreClaim);

const port = process.env.PORT ?? "3000";

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
