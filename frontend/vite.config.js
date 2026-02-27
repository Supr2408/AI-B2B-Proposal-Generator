import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // base path for GitHub Pages: https://<user>.github.io/<repo>/
  base: process.env.GITHUB_PAGES === 'true'
    ? '/AI-B2B-Proposal-Generator/'
    : '/',
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
