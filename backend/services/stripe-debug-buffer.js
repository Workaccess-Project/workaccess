// backend/services/stripe-debug-buffer.js
//
// BOX #86:
// - Shared in-memory Stripe webhook observability buffer
// - Process-local, best-effort only
// - Tenant-safe reads are done by filtering on companyId
// - No raw payloads, no secrets, no signatures

function safeString(v) {
  return (v ?? "").toString().trim();
}

const STRIPE_EVENT_BUFFER_LIMIT = 20;
const stripeEventBuffer = [];

export function pushStripeDebugEvent(entry) {
  stripeEventBuffer.push({
    ts: new Date().toISOString(),
    eventId: safeString(entry?.eventId) || null,
    type: safeString(entry?.type) || null,
    relevant: !!entry?.relevant,
    ignored: !!entry?.ignored,
    reason: safeString(entry?.reason) || null,
    companyId: safeString(entry?.companyId) || null,
    customerId: safeString(entry?.customerId) || null,
    subscriptionId: safeString(entry?.subscriptionId) || null,
    stripeObject: safeString(entry?.stripeObject) || null,
    objectId: safeString(entry?.objectId) || null,
  });

  if (stripeEventBuffer.length > STRIPE_EVENT_BUFFER_LIMIT) {
    stripeEventBuffer.splice(
      0,
      stripeEventBuffer.length - STRIPE_EVENT_BUFFER_LIMIT
    );
  }
}

export function getStripeDebugEventsForCompany(companyId) {
  const cid = safeString(companyId);
  if (!cid) return [];

  return stripeEventBuffer
    .filter((entry) => safeString(entry?.companyId) === cid)
    .slice()
    .reverse();
}
