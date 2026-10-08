/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps asset paths relative so the same build works on
// GitHub Pages (any repo name), `npm run preview`, or a local folder.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { environment: "node" },
});
