// backend/routes/reports.js
import express from "express";
import { listEmployees } from "../data-employees.js";

const router = express.Router();

function toDateOnly(d) {
  // dnešní den bez času (kvůli správnému porovnání)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseYmd(s) {
  // očekává "YYYY-MM-DD"
  if (!s) return null;
  const d = new Date(String(s));
  if (String(d) === "Invalid Date") return null;
  return toDateOnly(d);
}

function diffDays(a, b) {
  // b - a v dnech
  const ms = toDateOnly(b).getTime() - toDateOnly(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function displayName(e) {
  const n = (e?.name ?? "").toString().trim();
  if (n) return n;
  const fn = (e?.firstName ?? "").toString().trim();
  const ln = (e?.lastName ?? "").toString().trim();
  const joined = [fn, ln].filter(Boolean).join(" ").trim();
  return joined || "—";
}

/**
 * GET /api/reports/trainings?days=30
 * returns:
 * {
 *   days: 30,
 *   today: "YYYY-MM-DD",
 *   expired: [...],
 *   expiring: [...]
 * }
 */
router.get("/trainings", async (req, res) => {
  const days = Math.max(0, Number(req.query.days ?? 30) || 30);
  const today = toDateOnly(new Date());

  const employees = await listEmployees();

  const expired = [];
  const expiring = [];

  for (const e of employees) {
    const trainings = Array.isArray(e.trainings) ? e.trainings : [];
    for (const t of trainings) {
      const to = parseYmd(t?.validTo);
      if (!to) continue;

      const left = diffDays(today, to); // kolik dní zbývá do validTo
      const item = {
        employeeId: e.id,
        employeeName: displayName(e),
        company: e?.company ?? "—",
        position: e?.position ?? "—",
        trainingId: t?.id ?? null,
        trainingName: t?.name ?? "—",
        validFrom: t?.validFrom ?? null,
        validTo: t?.validTo ?? null,
        daysLeft: left,
      };

      if (left < 0) expired.push(item);
      else if (left <= days) expiring.push(item);
    }
  }

  // seřadíme: nejvíc urgentní nahoře
  expired.sort((a, b) => a.daysLeft - b.daysLeft);   // -200 dní nahoře
  expiring.sort((a, b) => a.daysLeft - b.daysLeft); // 0 dní nahoře

  const todayStr = new Date().toISOString().slice(0, 10);

  res.json({
    days,
    today: todayStr,
    expired,
    expiring,
  });
});

export default router;
