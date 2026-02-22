// backend/index.js

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import path from "path";
import { fileURLToPath } from "url";

// ENV CONTRACT (fail-fast in production)
import { enforceProductionEnvContract } from "./config/env-contract.js";

// ROUTES
import publicRouter from "./routes/public.js";
import itemsRouter from "./routes/items.js";
import employeesRouter from "./routes/employees.js";
import reportsRouter from "./routes/reports.js";
import auditRouter from "./routes/audit.js";
import meRouter from "./routes/me.js";
import authRouter from "./routes/auth.js";
import documentsRouter from "./routes/documents.js";
import sendRouter from "./routes/send.js";
import companyRouter from "./routes/company.js";
import contactsRouter from "./routes/contacts.js";
import alertsRouter from "./routes/alerts.js";
import billingRouter from "./routes/billing.js";
import companyDocumentTemplatesRouter from "./routes/companyDocumentTemplates.js";
import companyComplianceDocumentsRouter from "./routes/companyComplianceDocuments.js";
import companyComplianceOverviewRouter from "./routes/companyComplianceOverview.js";

// AUTH (middleware)
import { authMiddleware } from "./auth.js";
import { AUTH_MODE, IS_JWT_ONLY } from "./config/auth-mode.js";

// TENANT ENFORCEMENT
import { requireTenant } from "./middleware/require-tenant.js";

// TRIAL GUARD
import { trialGuard } from "./middleware/trial-guard.js";

// ERROR HANDLER
import { errorHandler } from "./middleware/error-handler.js";

// SCHEDULER
import { startDigestScheduler } from "./services/digest-scheduler.js";

// MUST run before server init (fail-fast in production)
enforceProductionEnvContract();

const app = express();

// --- Environment ---
const NODE_ENV = (process.env.NODE_ENV ?? "development").toString().trim();
const IS_PROD = NODE_ENV === "production";

const PORT_RAW = (process.env.PORT ?? "3000").toString().trim();
const PORT = Number(PORT_RAW) || 3000;

// Build/version metadata (optional; set during deploy)
const BUILD_SHA = (process.env.BUILD_SHA ?? "").toString().trim();
const BUILD_TIME = (process.env.BUILD_TIME ?? "").toString().trim();

// If behind reverse proxy (Nginx/Traefik), Express must trust proxy to get real client IP.
// In dev it can remain false.
if (IS_PROD) {
  app.set("trust proxy", 1);
}

// Reduce fingerprinting
app.disable("x-powered-by");

// --- Resolve paths (ESM __dirname) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Frontend is at projectRoot/frontend (backend is projectRoot/backend)
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");

// --- CORS (staging/prod-ready) ---
function parseCorsOrigins() {
  return (process.env.CORS_ORIGINS ?? "")
    .toString()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const corsOptions = {
  origin(origin, cb) {
    // allow requests without Origin header (curl, server-to-server)
    if (!origin) return cb(null, true);

    // DEV: allow all (fast local development)
    if (!IS_PROD) return cb(null, true);

    // PROD: whitelist only
    const allowed = parseCorsOrigins();
    if (allowed.length === 0) {
      return cb(
        {
          status: 500,
          code: "CORS_NOT_CONFIGURED",
          message:
            "CORS is not configured. Set CORS_ORIGINS (comma-separated) in environment.",
        },
        false
      );
    }

    if (allowed.includes(origin)) return cb(null, true);

    return cb(
      {
        status: 403,
        code: "CORS_FORBIDDEN",
        message: `Origin not allowed by CORS: ${origin}`,
      },
      false
    );
  },
};

// --- Security headers ---
// CSP can be tricky with static HTML/inline scripts; keep it off for MVP hardening layer.
// (We can add CSP later once we map frontend requirements.)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// --- Middlewares ---
app.use(cors(corsOptions));

// Request body size limit (anti payload abuse)
app.use(express.json({ limit: "200kb" }));

// ✅ Basic request logging (API only)
app.use((req, res, next) => {
  if (!req.originalUrl?.startsWith("/api")) return next();

  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    // log discipline: do not log headers/body; only method + path + status + latency
    console.log(`${req.method} ${req.originalUrl} -> ${status} (${ms}ms)`);
  });
  next();
});

// --- Basic abuse guard (burst protection) ---
const burstState = new Map(); // ip -> { ts, count }
const BURST_WINDOW_MS = 10_000; // 10s
const BURST_MAX = 60; // max requests per 10s per IP to /api

app.use("/api", (req, res, next) => {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const prev = burstState.get(ip);

  if (!prev || now - prev.ts > BURST_WINDOW_MS) {
    burstState.set(ip, { ts: now, count: 1 });
    return next();
  }

  prev.count += 1;
  if (prev.count > BURST_MAX) {
    return res.status(429).json({
      error: "TooManyRequests",
      message: "Too many requests (burst protection). Try again soon.",
    });
  }

  return next();
});

// --- Rate limiting ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "TooManyRequests",
    message: "Too many requests. Please try again later.",
  },
});

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120, // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "TooManyRequests",
    message: "Too many requests to public endpoints. Please try again later.",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "TooManyRequests",
    message: "Too many auth attempts. Please try again later.",
  },
});

// ✅ Serve frontend static files
app.use(express.static(FRONTEND_DIR));

// Optional: redirect root to login
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

// --- Health check (public: no auth, no tenant) ---
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    nodeEnv: NODE_ENV,
    authMode: AUTH_MODE,
    jwtOnly: IS_JWT_ONLY,
  });
});

// --- Version/build info (public: no auth, no tenant) ---
app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    nodeEnv: NODE_ENV,
    buildSha: BUILD_SHA || null,
    buildTime: BUILD_TIME || null,
  });
});

// Now apply global API limiter (does not affect / and static frontend)
app.use("/api", apiLimiter);

// --- Public routes (no auth, no tenant) ---
app.use("/api/public", publicLimiter, publicRouter);

// --- Auth middleware after public + health + version ---
app.use(authMiddleware);

// --- Auth routes ---
app.use("/api/auth", authLimiter, authRouter);

// --- Tenant enforcement for everything else ---
app.use(requireTenant);

// --- Trial guard ---
app.use(trialGuard);

// --- Routes ---
app.use("/api/items", itemsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/send", sendRouter);
app.use("/api/company", companyRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/me", meRouter);
app.use("/api/billing", billingRouter);
app.use("/api/company-document-templates", companyDocumentTemplatesRouter);
app.use("/api/company-compliance-documents", companyComplianceDocumentsRouter);
app.use("/api/company-compliance/overview", companyComplianceOverviewRouter);

// ✅ API 404 fallback (JSON, never HTML) — must be before errorHandler
app.use("/api", (req, res) => {
  return res.status(404).json({
    error: "NotFound",
    message: "API endpoint not found.",
    path: req.originalUrl,
    method: req.method,
    mode: AUTH_MODE,
  });
});

// --- Error handler must be last ---
app.use(errorHandler);

// --- Start server ---
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`NODE_ENV=${NODE_ENV} (prod=${IS_PROD})`);
  console.log(`AUTH_MODE=${AUTH_MODE} (jwtOnly=${IS_JWT_ONLY})`);
  if (IS_PROD) {
    console.log(`CORS_ORIGINS=${(process.env.CORS_ORIGINS ?? "").toString()}`);
    console.log(`trust proxy=1`);
  } else {
    console.log(`CORS=DEV (allow all)`);
  }
  console.log(`Serving frontend from: ${FRONTEND_DIR}`);
  if (BUILD_SHA) console.log(`BUILD_SHA=${BUILD_SHA}`);
  if (BUILD_TIME) console.log(`BUILD_TIME=${BUILD_TIME}`);
});

// start scheduler AFTER server is up
startDigestScheduler();