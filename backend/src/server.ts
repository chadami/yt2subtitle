import cors from "cors";
import express from "express";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { closeDatabase } from "./db.js";
import { initDatabase } from "./migrate.js";
import { aiRouter } from "./routes/ai.js";
import { accountRouter } from "./routes/account.js";
import { authRouter } from "./routes/auth.js";
import { jobsRouter } from "./routes/jobs.js";
import { subtitlesRouter } from "./routes/subtitles.js";
import { adminRouter } from "./routes/admin.js";
import { localRouter } from "./routes/local.js";

import { restrictLocalAccess, isExtensionOrigin } from "./localAccess.js";

const app = express();
app.use(restrictLocalAccess);

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
    origin: env.LOCAL_MODE
      ? (origin, callback) => callback(null, origin ? isExtensionOrigin(origin) : false)
      : env.EXTENSION_ORIGIN === "*" ? true : env.EXTENSION_ORIGIN,
    credentials: false
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const adminPublicDir = path.resolve(currentDir, "../admin-public/out");
const adminPages = new Set(["", "dashboard", "users", "jobs", "subtitles", "videos"]);

app.use("/admin", express.static(adminPublicDir));
app.get(/^\/admin(?:\/.*)?$/, (req, res, next) => {
  const route = req.path.replace(/^\/admin\/?/, "").replace(/\/$/, "");
  if (!adminPages.has(route)) {
    res.sendFile(path.join(adminPublicDir, "index.html"));
    return;
  }

  const pageDir = route === "dashboard" ? "" : route;
  const file = pageDir
    ? path.join(adminPublicDir, pageDir, "index.html")
    : path.join(adminPublicDir, "index.html");
  res.sendFile(file, (error) => {
    if (error) next(error);
  });
});

app.use("/api/auth", authRouter);
app.use("/api/account", accountRouter);
app.use("/api/ai", aiRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/subtitles", subtitlesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/local", localRouter);

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
    error: error instanceof Error ? error.message : "Internal server error",
    ...(typeof error === "object" && error !== null && "code" in error
      ? { code: String((error as { code?: unknown }).code || "") }
      : {})
  });
});

await initDatabase();
if (env.LOCAL_MODE) {
  const { recoverInterruptedJobs } = await import("./localRecovery.js");
  await recoverInterruptedJobs();
}

// In local mode the previous instance may still be shutting down (PGlite close is slow),
// so keep retrying the port for a few seconds instead of dying with EADDRINUSE.
function listen(attempt = 0): Server {
  const instance = app.listen(env.PORT, env.HOST, () => {
    console.log(`API listening on ${env.HOST}:${env.PORT}${env.LOCAL_MODE ? " (local mode)" : ""}`);
  });
  instance.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && env.LOCAL_MODE && attempt < 20) {
      console.warn(`Port ${env.PORT} is busy, retrying (${attempt + 1}/20)`);
      setTimeout(() => {
        server = listen(attempt + 1);
      }, 500);
      return;
    }
    throw error;
  });
  return instance;
}

let server: Server = listen();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down`);
    server.close(() => {
      void closeDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
