// backend/middleware/require-auth.js
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Chybí autentizace (JWT).",
    });
  }
  next();
}
