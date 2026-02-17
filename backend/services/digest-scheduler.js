// backend/services/digest-scheduler.js
import cron from "node-cron";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getCompanyProfile, updateCompanyProfile } from "../data-company.js";
import { sendAlertsDigestNowService } from "./alerts-service.js";
import { getContactById } from "../data-contacts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tenant dirs are here: backend/data/tenants/<companyId>
const TENANTS_DIR = path.join(__dirname, "..", "data", "tenants");

function safeString(v) {
  return (v ?? "").toString().trim();
}

function todayKeyPrague() {
  // “per-day” key: YYYY-MM-DD in Prague timezone-like behavior
  // For simplicity in DEV: use local time of server machine.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function listTenants() {
  try {
    const items = await fs.readdir(TENANTS_DIR, { withFileTypes: true });
    return items.filter((x) => x.isDirectory()).map((x) => x.name);
  } catch {
    return [];
  }
}

async function resolveRecipientEmailFromProfile(companyId, profile) {
  const alerts = profile?.alerts && typeof profile.alerts === "object" ? profile.alerts : {};

  const contactId = safeString(alerts.digestRecipientContactId);
  if (contactId) {
    const contact = await getContactById(companyId, contactId);
    const email = safeString(contact?.email);
    if (email) return email;
    return "";
  }

  // legacy fallback
  return safeString(alerts.digestEmail);
}

async function shouldSendToday(companyId) {
  const profile = await getCompanyProfile(companyId);

  const recipientEmail = safeString(await resolveRecipientEmailFromProfile(companyId, profile));
  if (!recipientEmail) return { ok: false, reason: "no_digest_recipient" };

  const alerts = profile?.alerts && typeof profile.alerts === "object" ? profile.alerts : {};
  const lastKey = safeString(alerts.lastDigestSentOn);
  const today = todayKeyPrague();

  if (lastKey === today) return { ok: false, reason: "already_sent_today" };

  return { ok: true, today };
}

async function markSentToday(companyId, today) {
  // uložíme do company.alerts.lastDigestSentOn = YYYY-MM-DD
  await updateCompanyProfile(companyId, { alerts: { lastDigestSentOn: today } });
}

export async function runDailyDigestJob({ actorRole = "system" } = {}) {
  const tenants = await listTenants();

  const results = [];

  for (const companyId of tenants) {
    try {
      const gate = await shouldSendToday(companyId);

      if (!gate.ok) {
        results.push({ companyId, ok: true, skipped: true, reason: gate.reason });
        continue;
      }

      const sent = await sendAlertsDigestNowService({
        companyId,
        actorRole,
      });

      await markSentToday(companyId, gate.today);

      results.push({
        companyId,
        ok: true,
        skipped: false,
        outboxId: sent.outboxId,
        transport: sent.transport,
        messageId: sent.messageId,
        expirationsCount: sent.expirationsCount,
        to: sent.to,
        recipient: sent.recipient,
      });
    } catch (err) {
      results.push({
        companyId,
        ok: false,
        error: err?.message || "Unknown error",
      });
    }
  }

  return {
    ranAt: new Date().toISOString(),
    count: results.length,
    results,
  };
}

export function startDigestScheduler() {
  // 08:00 každý den
  // Pozn: node-cron používá timezone option, nastavíme Europe/Prague
  cron.schedule(
    "0 8 * * *",
    async () => {
      const r = await runDailyDigestJob({ actorRole: "system" });
      console.log("[digest-job] done", r);
    },
    { timezone: "Europe/Prague" }
  );

  console.log("[digest-job] scheduled daily at 08:00 Europe/Prague");
}
