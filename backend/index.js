// backend/index.js

import express from "express";
import cors from "cors";

import path from "path";
import { fileURLToPath } from "url";

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

const app = express();

// --- Environment ---
const NODE_ENV = (process.env.NODE_ENV ?? "development").toString().trim();
const IS_PROD = NODE_ENV === "production";

const PORT_RAW = (process.env.PORT ?? "3000").toString().trim();
const PORT = Number(PORT_RAW) || 3000;

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

// --- Middlewares ---
app.use(cors(corsOptions));
app.use(express.json());

// ✅ Basic request logging (API only)
app.use((req, res, next) => {
  if (!req.originalUrl?.startsWith("/api")) return next();

  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    console.log(`${req.method} ${req.originalUrl} -> ${status} (${ms}ms)`);
  });
  next();
});

// ✅ Serve frontend static files (login.html, dashboard.html, etc.)
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

// --- Public routes (no auth, no tenant) ---
app.use("/api/public", publicRouter);

// --- Auth middleware after public + health ---
app.use(authMiddleware);

// --- Auth routes ---
app.use("/api/auth", authRouter);

// --- Tenant enforcement for everything else ---
app.use(requireTenant);

// --- Trial guard (blocks expired trial except allowlisted paths) ---
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
  } else {
    console.log(`CORS=DEV (allow all)`);
  }
  console.log(`Serving frontend from: ${FRONTEND_DIR}`);
});

// start scheduler AFTER server is up
startDigestScheduler();