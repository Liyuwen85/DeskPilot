import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  root: path.resolve("src/renderer"),
  build: {
    outDir: path.resolve("dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          const isScopedTiptap = id.includes(`${path.sep}@tiptap${path.sep}`) || id.includes("/@tiptap/");
          if (isScopedTiptap) {
            if (id.includes(`${path.sep}@tiptap${path.sep}extension-mathematics${path.sep}`) || id.includes("/@tiptap/extension-mathematics/")) {
              return "tiptap-math";
            }

            if (id.includes(`${path.sep}@tiptap${path.sep}react${path.sep}`) || id.includes("/@tiptap/react/")) {
              return "tiptap-react";
            }

            if (id.includes(`${path.sep}@tiptap${path.sep}starter-kit${path.sep}`) || id.includes("/@tiptap/starter-kit/")) {
              return "tiptap-starter";
            }

            if (id.includes(`${path.sep}@tiptap${path.sep}pm${path.sep}`) || id.includes("/@tiptap/pm/")) {
              return "tiptap-pm";
            }

            if (id.includes(`${path.sep}@tiptap${path.sep}extension-`) || id.includes("/@tiptap/extension-")) {
              return "tiptap-extensions";
            }

            return "tiptap-core";
          }

          if (id.includes(`${path.sep}katex${path.sep}`) || id.includes("/katex/")) {
            return "katex";
          }
        }
      }
    }
  }
});
