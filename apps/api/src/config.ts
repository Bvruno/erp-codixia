import { z } from 'zod';

export const esquemaEntorno = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Origen del panel de plataforma (segundo SPA). Opcional: sin él,
  // solo el WEB_ORIGIN pasa CORS.
  PLATFORM_ORIGIN: z.string().url().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
});

export type Entorno = z.infer<typeof esquemaEntorno>;

export function cargarEntorno(): Entorno {
  const parsed = esquemaEntorno.safeParse(process.env);
  if (!parsed.success) {
    console.error('[config] variables de entorno inválidas:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}