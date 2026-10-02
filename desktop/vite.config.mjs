import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, rolldownOptions:{input:{app:'index.html',check:'mermaid-check.html'}} },
});
