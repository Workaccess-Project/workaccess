// backend/scripts/bootstrap-tenant-hr.js

import { getCompanyProfile } from "../data-company.js";
import { createUser } from "../data-users.js";

function usage() {
  console.log(`
Usage:
  node scripts/bootstrap-tenant-hr.js <companyId> <email> <password> [name]

Example:
  node scripts/bootstrap-tenant-hr.js acme srovnal@acme.cz Heslo123 "Jan Srovnal"
`);
  process.exit(1);
}

async function main() {
  const [, , companyId, email, password, nameArg] = process.argv;

  if (!companyId || !email || !password) {
    usage();
  }

  const name = nameArg || "HR Admin";

  try {
    console.log("→ Initializing tenant:", companyId);

    // vytvoří company.json pokud neexistuje
    const company = await getCompanyProfile(companyId);

    console.log("→ Company profile ready:", company.companyId);

    // vytvoří prvního HR uživatele
    const user = await createUser(companyId, {
      email,
      password,
      name,
      role: "hr",
    });

    console.log("--------------------------------------------------");
    console.log("✅ TENANT BOOTSTRAPPED SUCCESSFULLY");
    console.log("Company ID:", companyId);
    console.log("User email:", user.email);
    console.log("Role:", user.role);
    console.log("Tenant folder: backend/data/tenants/" + companyId);
    console.log("--------------------------------------------------");
    console.log("You can now login via POST /api/auth/login");
    process.exit(0);
  } catch (err) {
    console.error("❌ Bootstrap failed:");
    console.error(err.message);
    if (err.payload) console.error(err.payload);
    process.exit(1);
  }
}

main();
