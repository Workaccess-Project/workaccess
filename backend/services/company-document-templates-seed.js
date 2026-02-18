// backend/services/company-document-templates-seed.js
import { readTenantEntity, writeTenantEntity } from "../data/tenant-store.js";

const ENTITY = "companyDocumentTemplates";

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "cdt") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function makeTemplate({
  name,
  description = "",
  hasExpiration = true,
  expirationDays = 365,
  notifyBeforeDays = 30,
}) {
  const ts = nowIso();
  return {
    id: makeId("cdt"),
    name,
    description,
    hasExpiration: !!hasExpiration,
    expirationDays: hasExpiration ? expirationDays : null,
    notifyBeforeDays: hasExpiration ? notifyBeforeDays : null,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Seedne defaultní company document templates pro nový tenant.
 * - Bez auditu (ať se audit neplní systémovými akcemi při registraci).
 * - Seed proběhne jen když je seznam prázdný.
 */
export async function seedDefaultCompanyDocumentTemplates(companyId) {
  const current = asArray(await readTenantEntity(companyId, ENTITY));

  // už existuje něco -> nic neděláme
  if (current.length > 0) {
    return { ok: true, seeded: false, count: current.length };
  }

  const defaults = [
    makeTemplate({
      name: "Revize hasicích přístrojů",
      description: "Pravidelná kontrola a revize hasicích přístrojů.",
      hasExpiration: true,
      expirationDays: 365,
      notifyBeforeDays: 30,
    }),
    makeTemplate({
      name: "Revize elektro",
      description: "Revize elektrických zařízení / rozvodů dle interních potřeb firmy.",
      hasExpiration: true,
      expirationDays: 730,
      notifyBeforeDays: 60,
    }),
    makeTemplate({
      name: "BOZP školení",
      description: "Periodické školení bezpečnosti a ochrany zdraví při práci.",
      hasExpiration: true,
      expirationDays: 365,
      notifyBeforeDays: 30,
    }),
    makeTemplate({
      name: "Požární ochrana",
      description: "Školení / prověrky v oblasti požární ochrany.",
      hasExpiration: true,
      expirationDays: 365,
      notifyBeforeDays: 30,
    }),
    makeTemplate({
      name: "Lékařské prohlídky",
      description: "Vstupní / periodické pracovně-lékařské prohlídky zaměstnanců.",
      hasExpiration: true,
      expirationDays: 730,
      notifyBeforeDays: 60,
    }),
  ];

  await writeTenantEntity(companyId, ENTITY, defaults);

  return { ok: true, seeded: true, count: defaults.length };
}
