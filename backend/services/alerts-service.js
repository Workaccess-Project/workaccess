// backend/services/alerts-service.js
import { listEmployees } from "./employees-service.js";
import { getCompanyService, updateCompanyService } from "./company-service.js";
import { auditLog } from "../data-audit.js";
import { sendPlainEmailService } from "./email-service.js";
import { getContactById } from "../data-contacts.js";

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

export async function listExpirationsService({ companyId, days = 30 } = {}) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const err = new Error("Missing companyId");
    err.status = 400;
    throw err;
  }

  const windowDays = parseDays(days, 30);
  const employees = await listEmployees({ companyId: cid });

  const now = new Date();
  const cutoff = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const items = [];

  for (const emp of employees || []) {
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

export async function getAlertsConfigService({ companyId } = {}) {
  const profile = await getCompanyService({ companyId });
  const alerts = profile?.alerts || {};

  return {
    companyId,
    expirationsDays: parseDays(alerts.expirationsDays, 30),

    // legacy fallback
    digestEmail: safeString(alerts.digestEmail).trim(),

    // new
    digestRecipientContactId: safeString(alerts.digestRecipientContactId).trim(),

    lastDigestSentOn: safeString(alerts.lastDigestSentOn).trim(),
  };
}

export async function updateAlertsConfigService({ companyId, actorRole, body } = {}) {
  const prev = await getAlertsConfigService({ companyId });

  const next = {
    expirationsDays: parseDays(body?.expirationsDays ?? prev.expirationsDays),

    // legacy fallback (necháváme, dokud nepřejdeme všude na contactId)
    digestEmail: safeString(body?.digestEmail ?? prev.digestEmail).trim(),

    // new preferred recipient
    digestRecipientContactId: safeString(
      body?.digestRecipientContactId ?? prev.digestRecipientContactId
    ).trim(),

    // lastDigestSentOn necháváme beze změny při ručním updatu configu
    lastDigestSentOn: prev.lastDigestSentOn,
  };

  await updateCompanyService({
    companyId,
    actorRole,
    body: { alerts: next },
  });

  await auditLog({
    companyId,
    actorRole,
    action: "alerts.config.update",
    entityType: "alerts",
    entityId: "config",
    before: prev,
    after: next,
  });

  return next;
}

function formatDigestText(result) {
  const lines = [];
  lines.push(`Workaccess – Expirace školení (${result.windowDays} dnů)`);
  lines.push("");

  if (!result.items.length) {
    lines.push("Žádné expirace.");
    return lines.join("\n");
  }

  for (const it of result.items) {
    const sev = it.severity === "expired" ? "PROŠLÉ" : "BRZY";
    lines.push(
      `- [${sev}] ${it.employeeName} – ${it.trainingName} (validTo ${it.validTo}, za ${it.daysLeft} dnů)`
    );
  }

  return lines.join("\n");
}

async function resolveDigestRecipient({ companyId, cfg }) {
  const contactId = safeString(cfg?.digestRecipientContactId).trim();
  if (contactId) {
    const contact = await getContactById(companyId, contactId);
    if (!contact) {
      const err = new Error("Digest recipient contact not found.");
      err.status = 400;
      err.payload = { field: "digestRecipientContactId" };
      throw err;
    }
    const email = safeString(contact.email).trim();
    if (!email) {
      const err = new Error("Digest recipient contact has no email.");
      err.status = 400;
      err.payload = { field: "digestRecipientContactId" };
      throw err;
    }
    return {
      to: email,
      recipient: { mode: "contact", contactId, contactName: safeString(contact.name).trim() },
    };
  }

  const legacyEmail = safeString(cfg?.digestEmail).trim();
  if (legacyEmail) {
    return { to: legacyEmail, recipient: { mode: "email", email: legacyEmail } };
  }

  const err = new Error("Digest recipient not configured.");
  err.status = 400;
  err.payload = { field: "digestRecipientContactId" };
  throw err;
}

export async function sendAlertsDigestNowService({ companyId, actorRole } = {}) {
  const cfg = await getAlertsConfigService({ companyId });

  const resolved = await resolveDigestRecipient({ companyId, cfg });

  const expirations = await listExpirationsService({
    companyId,
    days: cfg.expirationsDays,
  });

  const subject = `Workaccess – Expirace školení (${expirations.count})`;
  const text = formatDigestText(expirations);

  const sent = await sendPlainEmailService({
    companyId,
    actorRole,
    to: resolved.to,
    subject,
    message: text,
  });

  await auditLog({
    companyId,
    actorRole,
    action: "alerts.digest.send",
    entityType: "alerts",
    entityId: sent.outboxId,
    meta: {
      outboxId: sent.outboxId,
      transport: sent.transport,
      messageId: sent.messageId,
      expirationsCount: expirations.count,
      recipient: resolved.recipient,
      to: resolved.to,
    },
    before: null,
    after: { ok: true },
  });

  return {
    ok: true,
    ...sent,
    expirationsCount: expirations.count,
    to: resolved.to,
    recipient: resolved.recipient,
  };
}
