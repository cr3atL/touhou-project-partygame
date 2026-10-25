import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
  plugins: [react()],
  server: { port: 5173, strictPort: true, watch: {
    ignored: ['**/docs/**/*.png', '**/docs/**/*.pdf', '**/docs/**/*.svg', '**/output/**', '**/tmp/**'],
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
  } },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1800, rollupOptions: { output: { manualChunks(id) {
    if (id.includes('/node_modules/phaser/')) return 'phaser';
    if (id.includes('/node_modules/react') || id.includes('/node_modules/scheduler/')) return 'react';
    if (id.includes('/node_modules/@colyseus/')) return 'rooms';
  } } } }
});
