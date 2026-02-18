// backend/routes/companyComplianceDocuments.js
import express from "express";
import { requireWrite } from "../auth.js";
import {
  listCompanyComplianceDocuments,
  createCompanyComplianceDocumentFromTemplate,
} from "../services/company-compliance-documents-service.js";

const router = express.Router();

/**
 * GET /api/company-compliance-documents
 * READ pro všechny role
 */
router.get("/", async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;
    const items = await listCompanyComplianceDocuments({ companyId });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/company-compliance-documents/from-template
 * WRITE: hr/manager
 * Body:
 *  - templateId (required)
 *  - name (optional override)
 *  - note (optional)
 *  - issuedAt (optional ISO)
 */
router.post("/from-template", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;

    const created = await createCompanyComplianceDocumentFromTemplate({
      companyId,
      actorRole: req.role,
      body: req.body,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

export default router;
