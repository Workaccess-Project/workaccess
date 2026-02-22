// backend/ecosystem.config.cjs
// Production-ready PM2 configuration
// Loads backend/.env.production WITHOUT external dependencies (no dotenv).
//
// IMPORTANT:
// - Do NOT commit real secrets.
// - On VPS, provide a real backend/.env.production (or inject env vars via system/CI).
// - This merges .env.production into env_production so PM2 passes it to the process.

const path = require("path");
const fs = require("fs");

function parseEnvFile(absPath) {
  if (!fs.existsSync(absPath)) return {};
  const raw = fs.readFileSync(absPath, "utf8");

  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1);

    // Remove optional surrounding quotes
    val = val.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    env[key] = val;
  }
  return env;
}

const prodEnvPath = path.join(__dirname, ".env.production");
const prodEnvFromFile = parseEnvFile(prodEnvPath);

module.exports = {
  apps: [
    {
      name: "workaccess-api",
      cwd: __dirname,
      script: "index.js",

      instances: 1,
      exec_mode: "fork",

      autorestart: true,
      max_memory_restart: "300M",
      restart_delay: 5000, // prevent restart storm
      max_restarts: 10,    // fail-safe limit

      time: true,

      // Default development env
      env: {
        NODE_ENV: "development",
        PORT: "3000"
      },

      // Production mode (pm2 start ecosystem.config.cjs --env production)
      env_production: {
        ...prodEnvFromFile,
        NODE_ENV: "production"
      }
    }
  ]
};