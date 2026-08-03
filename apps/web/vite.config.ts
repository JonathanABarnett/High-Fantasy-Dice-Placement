import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base:
    process.env.GITHUB_PAGES === 'true' ? '/High-Fantasy-Dice-Placement/' : '/',
  plugins: [react()],
  build: {
    // Pixi is an intentionally isolated 551 kB renderer chunk (about 161 kB
    // compressed); application code remains far below this ceiling.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pixi.js')) return 'pixi';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
