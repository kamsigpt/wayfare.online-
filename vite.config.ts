import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'client',
  base: process.env.VITE_BASE ?? '/wayfare.online-/',
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['babylonjs'],
        },
      },
    },
  },
});
