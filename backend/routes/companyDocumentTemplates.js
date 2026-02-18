// backend/routes/companyDocumentTemplates.js
import express from "express";
import { requireWrite } from "../auth.js";
import {
  listCompanyDocumentTemplates,
  createCompanyDocumentTemplate,
  updateCompanyDocumentTemplate,
  deleteCompanyDocumentTemplate,
} from "../services/company-document-templates-service.js";

const router = express.Router();

/**
 * GET /api/company-document-templates
 * READ pro všechny role
 */
router.get("/", async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;
    const items = await listCompanyDocumentTemplates({ companyId });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/company-document-templates
 * WRITE: hr/manager
 */
router.post("/", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;

    const created = await createCompanyDocumentTemplate({
      companyId,
      actorRole: req.role,
      body: req.body,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/company-document-templates/:id
 * WRITE: hr/manager
 */
router.put("/:id", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;
    const { id } = req.params;

    const updated = await updateCompanyDocumentTemplate({
      companyId,
      actorRole: req.role,
      id,
      body: req.body,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/company-document-templates/:id
 * WRITE: hr/manager
 */
router.delete("/:id", requireWrite, async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;
    const { id } = req.params;

    const result = await deleteCompanyDocumentTemplate({
      companyId,
      actorRole: req.role,
      id,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
