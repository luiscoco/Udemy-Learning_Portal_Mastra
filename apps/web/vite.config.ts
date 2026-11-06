import { Agent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787';

// Reuse upstream connections: without keep-alive the dev proxy opens a new socket per request,
// and on Windows thousands of TIME_WAIT sockets can exhaust ephemeral ports during long sessions.
const ProxyAgent = new URL(apiTarget).protocol === 'https:' ? HttpsAgent : Agent;
const keepAliveAgent = new ProxyAgent({ keepAlive: true, maxSockets: 64 });

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Only VITE_PUBLIC_* variables may reach the browser bundle. Never put secrets here.
  envPrefix: 'VITE_PUBLIC_',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false, agent: keepAliveAgent },
    },
  },
  preview: { port: 4173, proxy: { '/api': { target: apiTarget, agent: keepAliveAgent } } },
  build: { sourcemap: true },
});
