// backend/routes/send.js
import express from "express";
import { requireRole, requireWrite } from "../auth.js";
import { sendDocumentEmailService } from "../services/email-service.js";
import { listOutboxService } from "../services/outbox-service.js";

const router = express.Router();

/**
 * POST /api/send/email
 * body: { to?, contactId?, subject, message, documentId }
 * WRITE: hr/manager
 */
router.post("/email", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;
    const { to, contactId, subject, message, documentId } = req.body ?? {};

    const result = await sendDocumentEmailService({
      companyId,
      actorRole: req.role,
      to,
      contactId,
      subject,
      message,
      documentId,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/send/outbox
 * READ: hr, manager, security
 *
 * Query:
 *  - limit, cursor
 *  - to (substring)
 *  - documentId
 *  - contactId
 *  - from, toDate
 */
router.get("/outbox", requireRole(["hr", "manager", "security"]), async (req, res) => {
  const companyId = req.auth.companyId;
  const result = await listOutboxService({ companyId, query: req.query });
  res.json(result);
});

export default router;
