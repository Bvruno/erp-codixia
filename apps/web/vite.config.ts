import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [TanStackRouterVite({ routesDirectory: './src/rutas', generatedRouteTree: './src/rutas/route-tree.gen.ts', autoCodeSplitting: true }), react()],
  resolve: {
    alias: {
      'next/link': fileURLToPath(new URL('./src/next/link.tsx', import.meta.url)),
      'next/navigation': fileURLToPath(
        new URL('./src/next/navigation.ts', import.meta.url)
      ),
      '@/lib/supabase': fileURLToPath(new URL('./src/lib/supabase', import.meta.url)),
      '@/lib/auth': fileURLToPath(new URL('./src/lib/auth', import.meta.url)),
      '@/lib/errors': fileURLToPath(new URL('./src/lib/errors.ts', import.meta.url)),
      '@/lib/realtime': fileURLToPath(new URL('./src/lib/realtime.ts', import.meta.url)),
      '@/lib/realtime-cache': fileURLToPath(new URL('./src/lib/realtime-cache.ts', import.meta.url)),
      '@/lib/utils': fileURLToPath(new URL('./src/lib/utils.ts', import.meta.url)),
      '@/lib/pipeline-filtros': fileURLToPath(
        new URL('./src/lib/pipeline-filtros.ts', import.meta.url)
      ),
      '@/lib/rutas-tareas': fileURLToPath(
        new URL('./src/lib/rutas-tareas.ts', import.meta.url)
      ),
      '@/lib/cache': fileURLToPath(new URL('./src/lib/cache.ts', import.meta.url)),
      '@/lib/cache-claves': fileURLToPath(new URL('./src/lib/cache-claves.ts', import.meta.url)),
      '@/lib/query-client': fileURLToPath(new URL('./src/lib/query-client.ts', import.meta.url)),
      '@/lib/use-perfil': fileURLToPath(new URL('./src/lib/use-perfil.ts', import.meta.url)),
      '@/lib/use-autoguardado': fileURLToPath(
        new URL('./src/lib/use-autoguardado.ts', import.meta.url)
      ),
      '@/lib/use-formato-hora': fileURLToPath(
        new URL('./src/lib/use-formato-hora.ts', import.meta.url)
      ),
      '@/lib/use-preferencias-trabajo': fileURLToPath(
        new URL('./src/lib/use-preferencias-trabajo.ts', import.meta.url)
      ),
      '@/lib/tema': fileURLToPath(new URL('./src/lib/tema.ts', import.meta.url)),
      '@/lib/vista-inicial': fileURLToPath(
        new URL('./src/lib/vista-inicial.ts', import.meta.url)
      ),
      '@/lib/use-cache-hidratacion': fileURLToPath(
        new URL('./src/lib/use-cache-hidratacion.ts', import.meta.url)
      ),
      '@/lib/entidades-meta': fileURLToPath(
        new URL('./src/lib/entidades-meta.ts', import.meta.url)
      ),
      '@/lib/nav-bus': fileURLToPath(new URL('./src/lib/nav-bus.ts', import.meta.url)),
      '@/lib/captura-errores': fileURLToPath(
        new URL('./src/lib/captura-errores.ts', import.meta.url)
      ),
      '@/lib/api': fileURLToPath(new URL('./src/lib/api', import.meta.url)),
      '@/lib': fileURLToPath(
        new URL('../../packages/shared/src/logica', import.meta.url)
      ),
      '@/types': fileURLToPath(
        new URL('../../packages/shared/src/types.ts', import.meta.url)
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/cws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
