// backend/routes/me.js
import express from "express";

const router = express.Router();

/**
 * GET /api/me
 * Vrací info o aktuální roli + jednoduché perms pro UI.
 * (DEMO – role je nastavena v authMiddleware do req.auth.role)
 */
router.get("/", (req, res) => {
  const role = req.auth?.role ?? "external";

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
