// backend/index.js
import express from "express";
import cors from "cors";

import itemsRouter from "./routes/items.js";
import employeesRouter from "./routes/employees.js";
import reportsRouter from "./routes/reports.js";
import auditRouter from "./routes/audit.js";
import meRouter from "./routes/me.js";

import { getRole } from "./auth.js";

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// ✅ všem requestům doplníme roli (ať ji mají i READ endpointy)
app.use((req, res, next) => {
  req.role = getRole(req);
  next();
});

// healthcheck
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// ✅ me (role + perms pro UI)
app.use("/api/me", meRouter);

// routes
app.use("/api/items", itemsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/audit", auditRouter);

// fallback 404
app.use((req, res) => {
  res.status(404).send(`Cannot ${req.method} ${req.path}`);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log("Routes mounted:");
  console.log("  GET  /api/health");
  console.log("  GET  /api/me");
  console.log("  *    /api/items");
  console.log("  *    /api/employees");
  console.log("  *    /api/reports");
  console.log("  GET  /api/audit");
});
