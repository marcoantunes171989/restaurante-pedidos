import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ root: ".tmp-ibpt-preview", plugins: [react()], server: { port: 5200, strictPort: true, fs: { allow: [".."] } }, css: { postcss: "C:/PedidoPrime/Codigo/pp-fiscal-e1" } });
