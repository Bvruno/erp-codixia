import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/rutas',
      generatedRouteTree: './src/rutas/route-tree.gen.ts',
      autoCodeSplitting: true,
    }),
    react(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
