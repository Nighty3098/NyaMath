import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Вендоры — отдельными чанками: кэшируются независимо от кода приложения.
        // three едет только с lazy-чанком Plot3dBlockView (см. Canvas.tsx).
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/mathjs')) return 'math';
          if (id.includes('node_modules/katex')) return 'katex';
          if (id.includes('node_modules/react-dom')) return 'react';
          if (id.includes('node_modules/react/')) return 'react';
          if (id.includes('node_modules/zustand')) return 'react';
          return undefined;
        },
      },
    },
  },
});
