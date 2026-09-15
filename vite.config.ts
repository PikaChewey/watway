import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { campusApi } from "./server/plugin";
export default defineConfig({
  plugins: [react(), campusApi()],
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 1700 },
});
