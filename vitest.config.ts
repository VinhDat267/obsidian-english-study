import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".mts", ".json"],
    alias: {
      obsidian: path.resolve(__dirname, "__mocks__/obsidian.ts"),
    },
  },
});
