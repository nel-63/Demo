import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Les tests d'intégration (vraie base) se lancent à part : npm run test:integration
    exclude: ["tests/integration/**", "node_modules/**"],
  },
});
