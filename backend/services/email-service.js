// backend/services/email-service.js
import nodemailer from "nodemailer";

import { auditLog } from "../data-audit.js";
import { downloadDocumentService } from "./documents.service.js";
import { EMAIL_FROM, HAS_SMTP, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_SECURE, SMTP_USER } from "../config/email.js";

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
  // jednoduchá validace (pro v1 stačí)
  if (!s || !s.includes("@") || s.length < 5) {
    const err = new Error(`Invalid '${fieldName}' email.`);
    err.status = 400;
    err.payload = { field: fieldName };
    throw err;
  }
  return s;
}

function buildTransport() {
  if (HAS_SMTP) {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE, // true jen pokud používáš 465
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    return { transport, mode: "smtp" };
  }

  // DEV fallback: nic reálně neposílá, ale vrací ok a dá se testovat
  const transport = nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });

  return { transport, mode: "stream" };
}

/**
 * sendDocumentEmailService:
 * - tenant-safe: documentId se hledá v tenant storage (documents.json + files/)
 * - audit: email.send
 */
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

  // Najdeme tenant dokument + fullPath (a zároveň to zaloguje audit document.download)
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

  // DEV stream transport: vypíšeme preview do konzole (užitečné pro test)
  if (mode === "stream") {
    const raw = info?.message;
    const preview =
      Buffer.isBuffer(raw) ? raw.toString("utf8") : safeString(raw);
    console.log("---- EMAIL (DEV stream transport) ----");
    console.log(preview);
    console.log("---- END EMAIL ----");
  }

  await auditLog({
    companyId: cid,
    actorRole,
    action: "email.send",
    entityType: "email",
    entityId: safeString(info?.messageId || ""),
    meta: {
      to: toEmail,
      subject: subj,
      documentId: doc.id,
      filename: doc.originalName,
      transport: mode,
    },
    before: null,
    after: { ok: true, transport: mode, messageId: safeString(info?.messageId || "") },
  });

  return {
    ok: true,
    transport: mode,
    messageId: safeString(info?.messageId || ""),
  };
}
