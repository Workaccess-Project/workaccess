// backend/routes/send.js
import express from "express";
import { requireWrite } from "../auth.js";
import { sendDocumentEmailService } from "../services/email-service.js";

const router = express.Router();

/**
 * POST /api/send/email
 * body: { to, subject, message, documentId }
 * WRITE: hr/manager
 */
router.post("/email", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;

    const { to, subject, message, documentId } = req.body ?? {};

    const result = await sendDocumentEmailService({
      companyId,
      actorRole: req.role,
      to,
      subject,
      message,
      documentId,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
