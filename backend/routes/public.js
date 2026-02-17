// backend/routes/public.js
import express from "express";
import { registerCompanyService } from "../services/registration-service.js";

const router = express.Router();

/**
 * POST /api/public/register-company
 * Body:
 *  - name: string (required)
 *  - companyId: string (required)  (slugified)
 *  - adminEmail: string (required)
 *  - adminPassword: string (required)
 *  - adminName: string (optional)
 *
 * Response:
 *  { ok: true, companyId, trialStart, trialEnd, token, user }
 */
router.post("/register-company", async (req, res, next) => {
  try {
    const result = await registerCompanyService(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
