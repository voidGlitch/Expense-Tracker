import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Reachable from a phone on the same Wi-Fi (http://<your-ip>:5173).
    // Everything is behind sign-in, but note that anyone on the network can
    // reach the page — turn this off with `host: false` if that matters.
    host: true,
    proxy: {
      // The API stays on 0.0.0.0; the dev server forwards to it, so the
      // browser only ever talks to one origin and the session cookie works.
      '/api': { target: 'http://0.0.0.0:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
