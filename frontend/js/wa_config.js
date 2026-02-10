// frontend/js/wa_config.js
// Jediná konfigurace API pro celý frontend.
//
// DEV: když běžíme na localhostu (Live Server :5500), backend je na :3000.
// PROD: v produkci chceme volat stejný origin /api (reverse proxy / hosting).

(() => {
  const DEV_API_ORIGIN = "http://localhost:3000";

  function getApiBase() {
    const host = (window.location.hostname || "").toLowerCase();
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1";

    // vždy vrací base včetně /api
    return isLocal ? `${DEV_API_ORIGIN}/api` : "/api";
  }

  window.WA_CONFIG = { getApiBase };
})();
