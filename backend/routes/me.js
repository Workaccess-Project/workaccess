// backend/routes/me.js
import express from "express";
import { getRole } from "../auth.js";

const router = express.Router();

/**
 * GET /api/me
 * Vrací info o aktuální roli + jednoduché perms pro UI.
 * (DEMO – role jde z hlavičky x-role)
 */
router.get("/", (req, res) => {
  const role = getRole(req);

  const canWrite = role === "hr" || role === "manager";

  res.json({
    role,
    perms: {
      canAdd: canWrite,
      canDelete: canWrite,
      canClearDone: canWrite,
    },
  });
});

export default router;
