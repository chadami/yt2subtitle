import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { initDatabase } from "./migrate.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { jobsRouter } from "./routes/jobs.js";
import { subtitlesRouter } from "./routes/subtitles.js";

const app = express();

app.use(express.json({ limit: "8mb" }));
app.use(
  cors({
    origin: env.EXTENSION_ORIGIN === "*" ? true : env.EXTENSION_ORIGIN,
    credentials: false
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/ai", aiRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/subtitles", subtitlesRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
});

await initDatabase();

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT}`);
});
