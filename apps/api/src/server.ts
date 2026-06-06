import cors from "cors";
import express from "express";
import { claims, getEnrichedClaim, sanitizeClaim, toPublicEnrichedClaim } from "./data/load";
import { scoreClaimStub } from "./scoring/stub";

const app = express();

app.use(cors());
app.use(express.json());

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

app.post("/api/claims/:id/score", (req, res) => {
  try {
    const enrichedClaim = getEnrichedClaim(req.params.id);
    res.json(scoreClaimStub(enrichedClaim.claim.id));
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

const port = process.env.PORT ?? "3000";

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
