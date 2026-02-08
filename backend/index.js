// backend/index.js
import express from "express";
import cors from "cors";

import itemsRouter from "./routes/items.js";
import employeesRouter from "./routes/employees.js";
import reportsRouter from "./routes/reports.js";

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// healthcheck
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// routes
app.use("/api/items", itemsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/reports", reportsRouter);

// fallback 404
app.use((req, res) => {
  res.status(404).send(`Cannot ${req.method} ${req.path}`);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
  console.log("Routes mounted:");
  console.log("  GET  /api/health");
  console.log("  *    /api/items");
  console.log("  *    /api/employees");
  console.log("  *    /api/reports");
});
