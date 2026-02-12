// backend/middleware/error-handler.js

export function errorHandler(err, req, res, next) {
  const status = err?.status || 500;

  // pokud service hodila structured error
  if (err?.payload) {
    return res.status(status).json({
      error: err.message,
      ...err.payload,
    });
  }

  // jinak fallback
  res.status(status).json({
    error: err?.message || "Internal Server Error",
  });
}
