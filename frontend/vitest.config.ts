import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    env: {
      NEXT_PUBLIC_API_URL: "http://localhost/api",
    },
    exclude: ["node_modules/**", ".next/**"],
  },
});
