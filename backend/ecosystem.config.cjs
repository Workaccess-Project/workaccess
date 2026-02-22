// backend/ecosystem.config.cjs
// Production-ready PM2 configuration
// IMPORTANT: Secrets are NOT stored here.
// Production values must be provided via .env.production on VPS.

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
      restart_delay: 5000,        // prevent restart storm
      max_restarts: 10,           // fail-safe limit

      time: true,

      // Default development env
      env: {
        NODE_ENV: "development",
        PORT: "3000"
      },

      // Production mode (pm2 start ecosystem.config.cjs --env production)
      env_production: {
        NODE_ENV: "production"
      }
    }
  ]
};