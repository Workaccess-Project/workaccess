// backend/ecosystem.config.cjs
// PM2 config (CommonJS on purpose; backend uses ESM "type": "module")

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
      time: true,

      // Default (dev-ish) env
      env: {
        NODE_ENV: "development",
        PORT: "3000"
      },

      // Production env (PM2: --env production)
      env_production: {
        NODE_ENV: "production",
        PORT: "3000",
        // Set this on VPS to your real domains:
        // Example: "https://workaccess.cz,https://www.workaccess.cz"
        CORS_ORIGINS: "",
        // Optional build metadata
        BUILD_SHA: "",
        BUILD_TIME: ""
      }
    }
  ]
};