import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Only VITE_PUBLIC_* variables may reach the browser bundle. Never put secrets here.
  envPrefix: 'VITE_PUBLIC_',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
    },
  },
  preview: { port: 4173, proxy: { '/api': { target: apiTarget } } },
  build: { sourcemap: true },
});
