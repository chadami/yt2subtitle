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
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});
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
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 500;
  const responseStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
  if (responseStatus >= 500) {
    console.error(error);
  } else {
    console.warn(error instanceof Error ? error.message : error);
  }
  res.status(responseStatus).json({
    error: error instanceof Error ? error.message : "Internal server error"
  });
});

await initDatabase();

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT}`);
});
