/**
 * Role Guard Layer (Foundation)
 * ------------------------------
 * Purpose:
 * - Prepare scalable role architecture.
 * - Separate permission logic from controllers.
 * - Be compatible with Feature Layer & Billing Layer.
 *
 * NOTE:
 * - No global enforcement yet.
 * - No DB schema change.
 * - No middleware wiring.
 *
 * Design principles:
 * - Owner = full access (deterministic override).
 * - Unknown role = minimal permissions.
 * - Fail-safe: invalid user -> deny.
 */

const ROLE = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  MEMBER: "Member",
};

/**
 * Canonical permission keys.
 * Keep stable — API contract for future RBAC expansion.
 */
const PERMISSION = {
  MANAGE_USERS: "manage_users",
  INVITE_USERS: "invite_users",
  DELETE_USERS: "delete_users",

  MANAGE_DOCUMENTS: "manage_documents",
  DELETE_DOCUMENTS: "delete_documents",

  VIEW_BILLING: "view_billing",
  MANAGE_BILLING: "manage_billing",

  MANAGE_ROLES: "manage_roles",
};

/**
 * Default permission policy by role.
 * Minimalist for v1.
 * Owner gets implicit full access (handled separately).
 */
const ROLE_PERMISSIONS = {
  [ROLE.ADMIN]: [
    PERMISSION.MANAGE_USERS,
    PERMISSION.INVITE_USERS,
    PERMISSION.MANAGE_DOCUMENTS,
    PERMISSION.VIEW_BILLING,
  ],
  [ROLE.MANAGER]: [
    PERMISSION.MANAGE_DOCUMENTS,
  ],
  [ROLE.MEMBER]: [],
};

function normalizeRole(role) {
  if (!role || typeof role !== "string") return ROLE.MEMBER;

  const trimmed = role.trim();

  if (trimmed === ROLE.OWNER) return ROLE.OWNER;
  if (trimmed === ROLE.ADMIN) return ROLE.ADMIN;
  if (trimmed === ROLE.MANAGER) return ROLE.MANAGER;

  return ROLE.MEMBER;
}

/**
 * Returns permissions for a role.
 */
function getRolePermissions(role) {
  const normalized = normalizeRole(role);

  if (normalized === ROLE.OWNER) {
    // Owner implicitly has all permissions
    return Object.values(PERMISSION);
  }

  return ROLE_PERMISSIONS[normalized] || [];
}

/**
 * Checks whether a user has a permission.
 * Fail-safe: invalid user -> false.
 */
function hasPermission(user, permissionKey) {
  if (!user || typeof user !== "object") return false;
  if (!permissionKey || typeof permissionKey !== "string") return false;

  const role = user.role;
  const permissions = getRolePermissions(role);

  return permissions.includes(permissionKey);
}

/**
 * Prepared helper for future 403 enforcement.
 */
function assertPermission(user, permissionKey) {
  return hasPermission(user, permissionKey);
}

module.exports = {
  ROLE,
  PERMISSION,
  getRolePermissions,
  hasPermission,
  assertPermission,
};