import cors from "cors";
import express from "express";
import { join } from "path";
import { DATA_DIR, claims, getEnrichedClaim, sanitizeClaim, toPublicEnrichedClaim } from "./data/load";
import { scoreClaimStub } from "./scoring/stub";

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

function scoreClaim(req: express.Request, res: express.Response) {
  try {
    const enrichedClaim = getEnrichedClaim(req.params.id);
    res.json(scoreClaimStub(enrichedClaim, claims));
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
}

app.post("/api/claim/:id/score", scoreClaim);
app.post("/api/claims/:id/score", scoreClaim);

export default app;
