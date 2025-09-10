
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// ❗️DEV NOTE
// Koristimo apsolutni API origin iz .env(.local) preko VITE_API_BASE
// i NE proxy-ujemo /auth, /api, /uploads kroz Vite. Time izbjegavamo
// situaciju da navigacija na /auth/* završi na backendu (405),
// a same XHR/fetch pozive rješava apsolutni URL iz client.ts.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, new URL(".", import.meta.url).pathname, "");
  const API_ORIGIN = env.VITE_API_BASE || "http://localhost:8081";

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": new URL("./src", import.meta.url).pathname },
    },
    server: {
      // Front je samo SPA dev server; API ide direktno na API_ORIGIN preko fetch-a
      port: 5173,
      host: true,
      cors: true,
      hmr: { overlay: true },
      proxy: {
        "/api": {
          target: "http://localhost:8081",
          changeOrigin: true,
        },
        "/auth": {
          target: "http://localhost:8081",
          changeOrigin: true,
        },
        "/files": {
          target: "http://localhost:8081",
          changeOrigin: true,
        },
        "/notifications": {
          target: "http://localhost:8081",
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
    define: {
      __API_ORIGIN__: JSON.stringify(API_ORIGIN),
    },
  };
});