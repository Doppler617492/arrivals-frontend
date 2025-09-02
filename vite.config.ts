
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// ❗️DEV NOTE
// Koristimo apsolutni API origin iz .env(.local) preko VITE_API_BASE
// i NE proxy-ujemo /auth, /api, /uploads kroz Vite. Time izbjegavamo
// situaciju da navigacija na /auth/* završi na backendu (405),
// a same XHR/fetch pozive rješava apsolutni URL iz client.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const API_ORIGIN = env.VITE_API_BASE || "http://localhost:8081";

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      // Front je samo SPA dev server; API ide direktno na API_ORIGIN preko fetch-a
      port: 5173,
      host: "127.0.0.1",
      cors: true,
      hmr: { overlay: true },
      // NEMA proxy-ja namjerno
    },
    preview: {
      port: 4173,
    },
    define: {
      __API_ORIGIN__: JSON.stringify(API_ORIGIN),
    },
  };
});