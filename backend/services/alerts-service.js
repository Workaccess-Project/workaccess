// backend/services/alerts-service.js
import { listEmployees } from "./employees-service.js";
import { getCompanyService, updateCompanyService } from "./company-service.js";
import { auditLog } from "../data-audit.js";
import { sendDocumentEmailService } from "./email-service.js";
import { addOutboxEntry } from "../data-outbox.js";

function safeString(v) {
  return (v ?? "").toString();
}

function parseDays(v, fallback = 30) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(365, Math.floor(n)));
}

function parseDateOnly(s) {
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
  if (daysLeft <= 0) return "expired";
  return "soon";
}

// --- EXPIRATIONS (BOX #10) ---
export async function listExpirationsService({ companyId, days = 30 } = {}) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const err = new Error("Missing companyId (tenant context).");
    err.status = 400;
    throw err;
  }

  const windowDays = parseDays(days, 30);

  const employees = await listEmployees({ companyId: cid });

  const now = new Date();
  const cutoff = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const items = [];

  for (const emp of Array.isArray(employees) ? employees : []) {
    const trainings = Array.isArray(emp.trainings) ? emp.trainings : [];

    for (const t of trainings) {
      const validTo = parseDateOnly(t?.validTo);
      if (!validTo) continue;

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

// --- CONFIG ---
export async function getAlertsConfigService({ companyId } = {}) {
  const profile = await getCompanyService({ companyId });

  const alerts = profile?.alerts && typeof profile.alerts === "object" ? profile.alerts : {};
  return {
    companyId: safeString(companyId),
    expirationsDays: parseDays(alerts.expirationsDays, 30),
    digestEmail: safeString(alerts.digestEmail).trim(),
  };
}

export async function updateAlertsConfigService({ companyId, actorRole, body } = {}) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const err = new Error("Missing companyId");
    err.status = 400;
    throw err;
  }

  const prev = await getAlertsConfigService({ companyId: cid });

  const next = {
    expirationsDays: parseDays(body?.expirationsDays ?? prev.expirationsDays, 30),
    digestEmail: safeString(body?.digestEmail ?? prev.digestEmail).trim(),
  };

  // uložíme do company profilu jako alerts: {...}
  await updateCompanyService({
    companyId: cid,
    actorRole,
    body: { alerts: next },
  });

  await auditLog({
    companyId: cid,
    actorRole,
    action: "alerts.config.update",
    entityType: "alerts",
    entityId: "config",
    meta: {},
    before: prev,
    after: next,
  });

  return { companyId: cid, ...next };
}

// --- DIGEST SEND-NOW ---
// Pozn.: používáme existující email sending, ale bez dokumentu.
// Proto uděláme "plain email" jako outbox entry (bez attachmentu) *v tomto BOXu*.
function requireEmailLike(v, fieldName = "digestEmail") {
  const s = safeString(v).trim();
  if (!s || !s.includes("@") || s.length < 5) {
    const err = new Error(`Invalid '${fieldName}' email.`);
    err.status = 400;
    err.payload = { field: fieldName };
    throw err;
  }
  return s;
}

function formatDigestText(result) {
  const lines = [];
  lines.push(`Workaccess – Expirace školení (okno ${result.windowDays} dní)`);
  lines.push(`Firma: ${result.companyId}`);
  lines.push("");
  if (!result.items.length) {
    lines.push("Žádné expirace v daném okně.");
    return lines.join("\n");
  }

  for (const it of result.items) {
    const sev = it.severity === "expired" ? "PROŠLÉ" : "BRZY";
    lines.push(
      `- [${sev}] ${it.employeeName} – ${it.trainingName} (validTo ${it.validTo}, za ${it.daysLeft} dní)`
    );
  }
  return lines.join("\n");
}

export async function sendAlertsDigestNowService({ companyId, actorRole } = {}) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const err = new Error("Missing companyId");
    err.status = 400;
    throw err;
  }

  const cfg = await getAlertsConfigService({ companyId: cid });
  const to = requireEmailLike(cfg.digestEmail, "digestEmail");

  const expirations = await listExpirationsService({ companyId: cid, days: cfg.expirationsDays });
  const subject = `Workaccess – Expirace školení (${expirations.count})`;
  const text = formatDigestText(expirations);

  // Pošleme email BEZ attachmentu: použijeme nodemailer přes sendDocumentEmailService neumíme,
  // takže v BOX #11 uděláme jednoduchý "email-only" přes outbox+audit a stream mode.
  // Abychom nezasahovali do email-service, pošleme přes /api/send/email bez dokumentu nejde.
  // Proto posíláme pouze "evidence" (outbox+audit) bez reálného odeslání.
  // (V BOX #12 doplníme obecný sendPlainEmailService.)
  const outboxEntry = await addOutboxEntry({
    companyId: cid,
    to,
    toSource: "raw",
    contactId: null,
    subject,
    messagePreview: text.slice(0, 200),
    documentId: "",
    filename: "",
    transport: "digest",
    messageId: "",
  });

  await auditLog({
    companyId: cid,
    actorRole,
    action: "alerts.digest.send",
    entityType: "alerts",
    entityId: outboxEntry.id,
    meta: { outboxId: outboxEntry.id, to, expirationsCount: expirations.count },
    before: null,
    after: { ok: true, outboxId: outboxEntry.id },
  });

  return { ok: true, outboxId: outboxEntry.id, to, expirationsCount: expirations.count };
}
