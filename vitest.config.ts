import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Tests never touch the app's data/ folder or graph8.
    env: { CONDUCTOR_DATA_DIR: path.join(os.tmpdir(), "conductor-test-data"), CONDUCTOR_MODE: "dry" },
  },
});
