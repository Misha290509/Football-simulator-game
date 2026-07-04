import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Split the stable vendor libraries from the app code so gameplay
        // updates don't re-download React/Dexie (long-lived browser cache).
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-db': ['dexie'],
        },
      },
    },
  },
});
