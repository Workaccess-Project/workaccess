// frontend/js/wa_role.js
// Sdílená logika pro roli (DEMO RBAC)
// MUSÍ být konzistentní s WA_NAV (frontend/js/wa_nav.js)

export const LS_ROLE = "wa_role_key"; // sjednoceno s WA_NAV

export const ROLE_LABELS = {
  hr: "HR",
  security: "Bezpečnost",
  manager: "Manažer",
  external: "Externista",
};

export function getRole() {
  // Bezpečný default: external (read-only)
  return (localStorage.getItem(LS_ROLE) || "external").toString();
}

export function setRole(role) {
  const r = (role || "external").toString();
  localStorage.setItem(LS_ROLE, r);
  return r;
}

export function roleLabel(role = getRole()) {
  return ROLE_LABELS[role] || role;
}

export function canWrite(role = getRole()) {
  // external je read-only, ostatní mohou write
  return role === "hr" || role === "manager" || role === "security";
}

export function headersWithRole(role = getRole()) {
  return {
    "Content-Type": "application/json",
    "x-role": role,
  };
}