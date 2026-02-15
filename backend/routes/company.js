// backend/routes/company.js
import express from "express";
import { requireWrite } from "../auth.js";
import { getCompanyService, updateCompanyService } from "../services/company-service.js";

const router = express.Router();

/**
 * GET /api/company
 * READ for all roles
 */
router.get("/", async (req, res) => {
  const companyId = req.auth.companyId;
  const profile = await getCompanyService({ companyId });
  res.json(profile);
});

/**
 * PUT /api/company
 * WRITE: hr/manager
 */
router.put("/", requireWrite, async (req, res) => {
  const companyId = req.auth.companyId;

  const updated = await updateCompanyService({
    companyId,
    actorRole: req.role,
    body: req.body,
  });

  res.json(updated);
});

export default router;
