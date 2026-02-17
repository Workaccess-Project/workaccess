// backend/index.js

import express from "express";
import cors from "cors";

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
const PORT = 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Health check (public: no auth, no tenant) ---
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
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

// --- Error handler must be last ---
app.use(errorHandler);

// --- Start server ---
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log(`AUTH_MODE=${AUTH_MODE} (jwtOnly=${IS_JWT_ONLY})`);
  console.log("Routes mounted:");
  console.log("  GET  /api/health");
  console.log("  *    /api/public");
  console.log("  POST /api/auth/login");
  console.log("  GET  /api/auth/me");
  console.log("  *    /api/items");
  console.log("  *    /api/employees");
  console.log("  *    /api/documents");
  console.log("  *    /api/send");
  console.log("  *    /api/company");
  console.log("  *    /api/contacts");
  console.log("  *    /api/alerts");
  console.log("  *    /api/reports");
  console.log("  GET  /api/audit");
  console.log("  GET  /api/me (compat)");
  console.log("  GET  /api/billing/status");
  console.log("  POST /api/billing/activate");
  console.log("  POST /api/billing/cancel");
});

// start scheduler AFTER server is up
startDigestScheduler();
