// backend/index.js

import express from "express";
import cors from "cors";

// ROUTES
import itemsRouter from "./routes/items.js";
import employeesRouter from "./routes/employees.js";
import reportsRouter from "./routes/reports.js";
import auditRouter from "./routes/audit.js";
import meRouter from "./routes/me.js";
import authRouter from "./routes/auth.js";

// AUTH (middleware)
import { authMiddleware } from "./auth.js";

// ERROR HANDLER
import { errorHandler } from "./middleware/error-handler.js";

const app = express();
const PORT = 3000;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// naše auth middleware (JWT má přednost, jinak DEMO x-role)
app.use(authMiddleware);

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// --- Routes ---
app.use("/api/auth", authRouter); // NEW
app.use("/api/items", itemsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/me", meRouter); // zachováno (kompatibilita)

// --- Error handler MUSÍ být až po routes ---
app.use(errorHandler);

// --- Start server ---
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log("Routes mounted:");
  console.log("  GET  /api/health");
  console.log("  GET  /api/me (demo/hybrid)");
  console.log("  POST /api/auth/login");
  console.log("  GET  /api/auth/me");
  console.log("  *    /api/items");
  console.log("  *    /api/employees");
  console.log("  *    /api/reports");
  console.log("  GET  /api/audit");
});
