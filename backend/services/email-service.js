// backend/services/email-service.js
import nodemailer from "nodemailer";

import { auditLog } from "../data-audit.js";
import { addOutboxEntry } from "../data-outbox.js";
import { downloadDocumentService } from "./documents.service.js";
import {
  EMAIL_FROM,
  HAS_SMTP,
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "../config/email.js";

function safeString(v) {
  return (v ?? "").toString();
}

function requireCompanyId(companyId) {
  const cid = safeString(companyId).trim();
  if (!cid) {
    const err = new Error("Missing companyId (tenant context).");
    err.status = 400;
    throw err;
  }
  return cid;
}

function requireEmailLike(v, fieldName = "to") {
  const s = safeString(v).trim();
  if (!s || !s.includes("@") || s.length < 5) {
    const err = new Error(`Invalid '${fieldName}' email.`);
    err.status = 400;
    err.payload = { field: fieldName };
    throw err;
  }
  return s;
}

function clip(s, n = 160) {
  const x = safeString(s);
  return x.length <= n ? x : x.slice(0, n) + "…";
}

function buildTransport() {
  if (HAS_SMTP) {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
    return { transport, mode: "smtp" };
  }

  const transport = nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });

  return { transport, mode: "stream" };
}

/* ============================================================
   1) SEND PLAIN EMAIL (NOVÉ)
   ============================================================ */

export async function sendPlainEmailService({
  companyId,
  actorRole,
  to,
  subject,
  message,
} = {}) {
  const cid = requireCompanyId(companyId);

  const toEmail = requireEmailLike(to, "to");
  const subj = safeString(subject).trim() || "Workaccess notification";
  const msg = safeString(message);

  const { transport, mode } = buildTransport();

  const mail = {
    from: EMAIL_FROM,
    to: toEmail,
    subject: subj,
    text: msg || "",
  };

  const info = await transport.sendMail(mail);

  if (mode === "stream") {
    const raw = info?.message;
    const preview =
      Buffer.isBuffer(raw) ? raw.toString("utf8") : safeString(raw);
    console.log("---- EMAIL (DEV stream transport) ----");
    console.log(preview);
    console.log("---- END EMAIL ----");
  }

  const messageId = safeString(info?.messageId || "");

  const outboxEntry = await addOutboxEntry({
    companyId: cid,
    to: toEmail,
    toSource: "raw",
    contactId: null,
    subject: subj,
    messagePreview: clip(msg, 200),
    documentId: "",
    filename: "",
    transport: mode,
    messageId,
  });

  await auditLog({
    companyId: cid,
    actorRole,
    action: "email.send",
    entityType: "email",
    entityId: messageId,
    meta: {
      outboxId: outboxEntry.id,
      to: toEmail,
      subject: subj,
      transport: mode,
    },
    before: null,
    after: { ok: true, transport: mode, messageId },
  });

  return {
    ok: true,
    transport: mode,
    messageId,
    outboxId: outboxEntry.id,
  };
}

/* ============================================================
   2) SEND DOCUMENT EMAIL (PŮVODNÍ)
   ============================================================ */

export async function sendDocumentEmailService({
  companyId,
  actorRole,
  to,
  subject,
  message,
  documentId,
} = {}) {
  const cid = requireCompanyId(companyId);

  const toEmail = requireEmailLike(to, "to");
  const subj = safeString(subject).trim() || "Workaccess document";
  const msg = safeString(message);

  const docId = safeString(documentId).trim();
  if (!docId) {
    const err = new Error("Missing documentId");
    err.status = 400;
    err.payload = { field: "documentId" };
    throw err;
  }

  const { doc, fullPath } = await downloadDocumentService({
    companyId: cid,
    actorRole,
    id: docId,
  });

  const { transport, mode } = buildTransport();

  const mail = {
    from: EMAIL_FROM,
    to: toEmail,
    subject: subj,
    text: msg || "",
    attachments: [
      {
        filename: doc.originalName || "document",
        path: fullPath,
        contentType: doc.mimeType || "application/octet-stream",
      },
    ],
  };

  const info = await transport.sendMail(mail);

  if (mode === "stream") {
    const raw = info?.message;
    const preview =
      Buffer.isBuffer(raw) ? raw.toString("utf8") : safeString(raw);
    console.log("---- EMAIL (DEV stream transport) ----");
    console.log(preview);
    console.log("---- END EMAIL ----");
  }

  const messageId = safeString(info?.messageId || "");

  const outboxEntry = await addOutboxEntry({
    companyId: cid,
    to: toEmail,
    toSource: "raw",
    contactId: null,
    subject: subj,
    messagePreview: clip(msg, 200),
    documentId: doc.id,
    filename: doc.originalName,
    transport: mode,
    messageId,
  });

  await auditLog({
    companyId: cid,
    actorRole,
    action: "email.send",
    entityType: "email",
    entityId: messageId,
    meta: {
      outboxId: outboxEntry.id,
      to: toEmail,
      subject: subj,
      documentId: doc.id,
      filename: doc.originalName,
      transport: mode,
    },
    before: null,
    after: { ok: true, transport: mode, messageId },
  });

  return {
    ok: true,
    transport: mode,
    messageId,
    outboxId: outboxEntry.id,
  };
}
