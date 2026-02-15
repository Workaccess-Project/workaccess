// backend/services/alerts-service.js
import { listEmployees } from "./employees-service.js";

function safeString(v) {
  return (v ?? "").toString();
}

function parseDays(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 30;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

function parseDateOnly(s) {
  // očekáváme ISO nebo YYYY-MM-DD; pro porovnání stačí Date(s)
  if (!s) return null;
  const d = new Date(String(s));
  if (String(d) === "Invalid Date") return null;
  return d;
}

function daysBetween(from, to) {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function severityForDaysLeft(daysLeft) {
  if (daysLeft < 0) return "expired";
  if (daysLeft === 0) return "expired";
  return "soon";
}

export async function listExpirationsService({ companyId, days = 30 } = {}) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const err = new Error("Missing companyId (tenant context).");
    err.status = 400;
    throw err;
  }

  const windowDays = parseDays(days);

  // employees-service už umí tenant scoped read
  const employees = await listEmployees({ companyId: cid });

  const now = new Date();
  const cutoff = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const items = [];

  for (const emp of Array.isArray(employees) ? employees : []) {
    const trainings = Array.isArray(emp.trainings) ? emp.trainings : [];

    for (const t of trainings) {
      const validTo = parseDateOnly(t?.validTo);
      if (!validTo) continue;

      // bereme jen ty, co jsou expired nebo do cutoff
      if (validTo.getTime() > cutoff.getTime()) continue;

      const daysLeft = daysBetween(now, validTo);

      items.push({
        type: "training",
        severity: severityForDaysLeft(daysLeft),
        daysLeft,
        employeeId: safeString(emp.id),
        employeeName: safeString(emp.name),
        trainingId: safeString(t.id),
        trainingName: safeString(t.name),
        validTo: safeString(t.validTo),
        validFrom: safeString(t.validFrom),
      });
    }
  }

  // seřadit: nejdřív expired (nejvíc prošlé), pak soon (nejdřív nejbližší)
  const rank = (sev) => (sev === "expired" ? 0 : 1);
  items.sort((a, b) => {
    const r = rank(a.severity) - rank(b.severity);
    if (r !== 0) return r;
    return a.daysLeft - b.daysLeft;
  });

  return {
    companyId: cid,
    windowDays,
    count: items.length,
    items,
  };
}
