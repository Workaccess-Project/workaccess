// backend/routes/companyComplianceOverview.js
import express from "express";
import { getCompanyComplianceOverview } from "../services/company-compliance-overview-service.js";

const router = express.Router();

/**
 * GET /api/company-compliance/overview
 * READ pro všechny role
 */
router.get("/", async (req, res, next) => {
  try {
    const companyId = req.auth.companyId;
    const overview = await getCompanyComplianceOverview({ companyId });
    res.json(overview);
  } catch (err) {
    next(err);
  }
});

export default router;
