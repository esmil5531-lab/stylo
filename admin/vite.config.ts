import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The admin app calls the API at /v1 on its own origin; in development Vite forwards
// those requests to the Stylo API (STYLO_API_URL, default http://localhost:4000).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5174,
    host: true,
    proxy: { '/v1': process.env.STYLO_API_URL ?? 'http://localhost:4000' },
  },
  preview: {
    port: 5174,
    proxy: { '/v1': process.env.STYLO_API_URL ?? 'http://localhost:4000' },
  },
});
