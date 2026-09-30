import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';

// Vite proxies /api and /ws to the local API (same paths nginx uses in Docker),
// so the app never needs a hard-coded API origin. `vite preview` gets the same table,
// so the production bundle can be checked locally without nginx. The E2E suite points
// the proxy at its own isolated API and simulator via SIMU_API_URL / SIMU_SIMULATOR_URL.
const apiUrl = process.env.SIMU_API_URL ?? 'http://localhost:3000';
const simulatorUrl = process.env.SIMU_SIMULATOR_URL ?? 'http://localhost:4000';

const proxy: Record<string, ProxyOptions> = {
  '/api': {
    target: apiUrl,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
  '/ws': {
    target: apiUrl.replace(/^http/, 'ws'),
    ws: true,
  },
  // Simulator control panel (internal service), same path as nginx in Docker.
  '/simulator': {
    target: simulatorUrl,
    rewrite: (path) => path.replace(/^\/simulator/, ''),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: Number(process.env.WEB_PORT ?? 5173), proxy },
  preview: { port: 4173, proxy },
});
