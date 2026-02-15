// backend/services/contacts-service.js
import { auditLog } from "../data-audit.js";
import {
  listContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
} from "../data-contacts.js";

export async function listContactsService({ companyId }) {
  return await listContacts(companyId);
}

export async function getContactByIdService({ companyId, id }) {
  const item = await getContactById(companyId, id);
  if (!item) {
    const err = new Error("Contact not found");
    err.status = 404;
    throw err;
  }
  return item;
}

export async function createContactService({ companyId, actorRole, body }) {
  const created = await createContact(companyId, body);

  await auditLog({
    companyId,
    actorRole,
    action: "contact.create",
    entityType: "contact",
    entityId: String(created.id),
    meta: {},
    before: null,
    after: created,
  });

  return created;
}

export async function updateContactService({ companyId, actorRole, id, body }) {
  const { before, after } = await updateContact(companyId, id, body);

  await auditLog({
    companyId,
    actorRole,
    action: "contact.update",
    entityType: "contact",
    entityId: String(id),
    meta: {},
    before,
    after,
  });

  return after;
}

export async function deleteContactService({ companyId, actorRole, id }) {
  const { before } = await deleteContact(companyId, id);

  await auditLog({
    companyId,
    actorRole,
    action: "contact.delete",
    entityType: "contact",
    entityId: String(id),
    meta: {},
    before,
    after: null,
  });

  return { ok: true };
}
