// backend/services/company-service.js
import { auditLog } from "../data-audit.js";
import { getCompanyProfile, updateCompanyProfile } from "../data-company.js";

export async function getCompanyService({ companyId }) {
  return await getCompanyProfile(companyId);
}

export async function updateCompanyService({ companyId, actorRole, body }) {
  const { before, after } = await updateCompanyProfile(companyId, body);

  await auditLog({
    companyId,
    actorRole,
    action: "company.update",
    entityType: "company",
    entityId: String(companyId),
    meta: {},
    before,
    after,
  });

  return after;
}
