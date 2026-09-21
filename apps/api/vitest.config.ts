import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@/lib/supabase': fileURLToPath(
        new URL('./src/lib/supabase', import.meta.url)
      ),
      '@/lib/auth': fileURLToPath(new URL('./src/lib/auth', import.meta.url)),
      '@/lib/audit': fileURLToPath(new URL('./src/lib/audit.ts', import.meta.url)),
      '@/lib/telegram-alert': fileURLToPath(
        new URL('./src/lib/telegram-alert.ts', import.meta.url)
      ),
      '@/lib/org-export': fileURLToPath(
        new URL('./src/lib/org-export.ts', import.meta.url)
      ),
      '@/lib/captura-errores': fileURLToPath(
        new URL('./src/lib/captura-errores.ts', import.meta.url)
      ),
      '@/lib': fileURLToPath(
        new URL('../../packages/shared/src/logica', import.meta.url)
      ),
      '@/types': fileURLToPath(
        new URL('../../packages/shared/src/types.ts', import.meta.url)
      ),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});