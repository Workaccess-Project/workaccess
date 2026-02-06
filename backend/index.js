import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import itemsRouter from "./routes/items.js";
import employeesRouter from "./routes/employees.js";
const app = express();
const PORT = 3000;

// --- helpers for serving frontend (ESM path fix) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- middleware ---
app.use(cors()); // pro demo necháme, později zpřísníme
app.use(express.json());

// --- serve frontend as static files ---
const frontendDir = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));

// --- DEMO RBAC: role labels + perms ---
const ROLE_LABELS = {
  hr: "HR",
  security: "Bezpečnost",
  manager: "Manažer",
  external: "Externista",
};

const ROLE_PERMS = {
  hr:      { canAdd:true,  canDelete:true,  canEdit:true,  canCopy:true,  canPaste:true,  canClearDone:true, canToggle:true },
  manager: { canAdd:true,  canDelete:true,  canEdit:true,  canCopy:true,  canPaste:true,  canClearDone:true, canToggle:true },
  security:{ canAdd:false, canDelete:false, canEdit:false, canCopy:false, canPaste:false, canClearDone:false, canToggle:true },
  external:{ canAdd:false, canDelete:false, canEdit:false, canCopy:false, canPaste:false, canClearDone:false, canToggle:true },
};

// DEMO: role čteme z hlavičky "x-role" (posílá frontend)
// když tam nic není, dáme hr (ať je to použitelné)
function getRoleFromRequest(req) {
  const raw = (req.headers["x-role"] ?? "").toString().trim().toLowerCase();
  if (raw && ROLE_PERMS[raw]) return raw;
  return "hr";
}

// --- status endpoint ---
app.get("/api/status", (req, res) => {
  res.json({ status: "Backend je dostupný 🚀" });
});

// --- "kdo jsem" endpoint (DEMO) ---
app.get("/api/me", (req, res) => {
  const role = getRoleFromRequest(req);
  res.json({
    role,
    roleLabel: ROLE_LABELS[role] || role,
    perms: ROLE_PERMS[role] || ROLE_PERMS.hr,
  });
});

// items API
app.use("/api/items", itemsRouter);
app.use("/api/employees", employeesRouter);
// --- fallback: open page from the same server ---
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server běží na http://localhost:${PORT}`);
  console.log(`✅ Frontend se servíruje z: ${frontendDir}`);
});
