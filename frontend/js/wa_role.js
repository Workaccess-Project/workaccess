// frontend/js/wa_role.js
// Sdílená logika pro roli (DEMO RBAC) – používá dashboard i employees

export const LS_ROLE = "workaccess.portal.role";

export const ROLE_LABELS = {
  hr: "HR",
  security: "Bezpečnost",
  manager: "Manažer",
  external: "Externista",
};

export function getRole() {
  return (localStorage.getItem(LS_ROLE) || "hr").toString();
}

export function setRole(role) {
  const r = (role || "hr").toString();
  localStorage.setItem(LS_ROLE, r);
  return r;
}

export function roleLabel(role = getRole()) {
  return ROLE_LABELS[role] || role;
}

export function canWrite(role = getRole()) {
  return role === "hr" || role === "manager";
}

export function headersWithRole(role = getRole()) {
  return {
    "Content-Type": "application/json",
    "x-role": role,
  };
}
