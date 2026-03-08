/**
 * Billing Lock Guard
 *
 * BOX #93
 *
 * Enforces READ ONLY mode when billing is not in good standing.
 *
 * Locked statuses:
 *   - past_due
 *   - unpaid
 *   - cancelled
 *
 * Default behavior in locked mode:
 *   - allow: GET, HEAD, OPTIONS
 *   - block: POST, PUT, PATCH, DELETE
 *
 * Explicit recovery exceptions:
 *   - POST /api/billing/stripe/customer-portal
 *   - POST /api/billing/stripe/create-checkout-session
 */

const LOCKED_STATUSES = new Set([
  "past_due",
  "unpaid",
  "cancelled",
]);

const ALLOWED_METHODS_IN_READ_ONLY = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const RECOVERY_POST_PATHS = new Set([
  "/api/billing/stripe/customer-portal",
  "/api/billing/stripe/create-checkout-session",
]);

export function billingLockGuard(req, res, next) {
  try {
    const company = req.company;

    if (!company || !company.billing) {
      return next();
    }

    const billingStatus = company.billing.billingStatus;

    if (!LOCKED_STATUSES.has(billingStatus)) {
      return next();
    }

    const method = (req.method || "").toUpperCase();
    const path = (req.path || "").toString();
    const originalUrl = (req.originalUrl || "").toString();

    if (ALLOWED_METHODS_IN_READ_ONLY.has(method)) {
      return next();
    }

    if (
      method === "POST" &&
      (RECOVERY_POST_PATHS.has(path) || RECOVERY_POST_PATHS.has(originalUrl))
    ) {
      return next();
    }

    return res.status(402).json({
      error: "BILLING_LOCKED",
      billingStatus,
      mode: "read_only",
    });
  } catch (err) {
    return next(err);
  }
}
