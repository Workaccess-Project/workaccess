// backend/routes/auth.js
import express from "express";
import { loginWithPassword } from "../services/auth.service.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = express.Router();

/**
 * POST /api/auth/login
 * body: { email, password }
 * returns: { token, user }
 */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const { user, token } = await loginWithPassword({ email, password });
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * requires Authorization: Bearer <token>
 */
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
