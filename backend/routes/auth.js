const express = require("express");
const router = express.Router();

const { getUserByUsername } = require("../data");

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Chybí username nebo password" });
  }

  const user = getUserByUsername(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Neplatné přihlašovací údaje" });
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  res.json({ ok: true, user: { id: user.id, username: user.username } });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Nepodařilo se odhlásit" });
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: { id: req.session.userId, username: req.session.username } });
});

module.exports = router;
