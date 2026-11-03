import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Autorise le téléphone / les autres appareils du réseau local à charger le mode développement
  // (sinon le JavaScript est bloqué : la page s'affiche mais les boutons ne répondent pas).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
