// backend/middleware/error-handler.js

import { AUTH_MODE } from "../config/auth-mode.js";

function inferStatusAndCode(err) {
  // explicit status from error
  const status =
    Number(err?.statusCode || err?.status) ||
    (err?.name === "UnauthorizedError" ? 401 : null);

  // common message-based inference for legacy throws
  const msg = (err?.message ?? "").toString();

  if (!status) {
    if (/missing companyid/i.test(msg)) return { status: 400, code: "TENANT_MISSING" };
    if (/not found/i.test(msg)) return { status: 404, code: "NOT_FOUND" };
    if (/forbidden/i.test(msg)) return { status: 403, code: "FORBIDDEN" };
    if (/unauthorized|invalid token|token/i.test(msg)) return { status: 401, code: "UNAUTHORIZED" };
  }

  if (status) {
    // map default codes by status if none inferred
    const code =
      err?.code ||
      (status === 400 ? "BAD_REQUEST" :
       status === 401 ? "UNAUTHORIZED" :
       status === 403 ? "FORBIDDEN" :
       status === 404 ? "NOT_FOUND" :
       "INTERNAL_ERROR");
    return { status, code };
  }

  return { status: 500, code: "INTERNAL_ERROR" };
}

export function errorHandler(err, req, res, next) {
  const { status, code } = inferStatusAndCode(err);

  // If service threw structured error via err.payload, keep payload but normalize shape
  if (err?.payload) {
    const payloadError = err?.payload?.error || err?.message || "Error";
    const payloadMessage = err?.payload?.message || err?.message || "Request failed.";

    const base = {
      error: payloadError,
      code: err?.payload?.code || err?.code || code,
      message: payloadMessage,
      mode: AUTH_MODE,
      path: req?.originalUrl,
      method: req?.method,
    };

    const extra = { ...err.payload };
    delete extra.error;
    delete extra.code;
    delete extra.message;

    const out = { ...base, ...extra };

    if (AUTH_MODE === "DEV" && err?.stack) out.stack = err.stack;

    return res.status(status).json(out);
  }

  // Default normalized error response
  const out = {
    error: status >= 500 ? "InternalError" : "RequestError",
    code,
    message: err?.message || (status >= 500 ? "Internal Server Error" : "Request failed."),
    mode: AUTH_MODE,
    path: req?.originalUrl,
    method: req?.method,
  };

  if (AUTH_MODE === "DEV" && err?.stack) out.stack = err.stack;

  return res.status(status).json(out);
}