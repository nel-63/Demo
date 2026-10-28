import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests d'intégration : vraie base PostgreSQL, vrai client Prisma.
// Lancer avec : npm run test:integration   (variable TEST_DATABASE_URL obligatoire)
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Le client Prisma de l'application lit DATABASE_URL : on la fait pointer vers la base de test.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
