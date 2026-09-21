/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard de arquitectura del SPA.
// Regla del proyecto: apps/web SOLO habla con Supabase para auth/sesión
// (supabase-js browser). Todo dato (tablas, storage, canales, rpc) va por la
// API. Este test escanea el código fuente y falla ante cualquier violación,
// para que la regla no dependa de revisión manual.

// vitest ejecuta con cwd = raíz del workspace (@erp/web).
const RAIZ_SRC = resolve(process.cwd(), 'src');

// Módulos con permiso explícito de instanciar el cliente de Supabase.
const PERMITEN_CREATECLIENT = [
  'lib/supabase/client.ts', // definición del cliente (único createClient real)
  'lib/auth/', // login/logout/reset/oauth y lectura de sesión
  'lib/api/cliente.ts', // Bearer + X-Refresh-Token hacia la API
  'lib/realtime.ts', // tokens para la pasarela /cws (nunca canales directos)
];

// Acceso a datos vía supabase-js: prohibido en todo el SPA.
const PATRONES_PROHIBIDOS: { patron: RegExp; motivo: string }[] = [
  { patron: /\bsupabase\s*\.\s*(from|storage|channel|rpc|functions)\b/, motivo: 'acceso a datos vía supabase-js' },
  { patron: /createClient\s*\(\s*\)\s*\.\s*(from|storage|channel|rpc|functions)\b/, motivo: 'acceso a datos vía supabase-js' },
];

function archivosFuente(dir = RAIZ_SRC): string[] {
  const resultado: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      resultado.push(...archivosFuente(ruta));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entrada.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entrada.name)) continue;
    resultado.push(ruta);
  }
  return resultado;
}

const FUENTES = archivosFuente().map((absoluta) => ({
  absoluta,
  relativa: relative(RAIZ_SRC, absoluta).split(sep).join('/'),
}));

// Descarta comentarios de línea/bloque para no marcar menciones en prosa.
function soloCodigo(contenido: string): string {
  return contenido
    .split('\n')
    .filter((linea) => {
      const t = linea.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

describe('arquitectura: el SPA solo usa Supabase para auth/sesión', () => {
  it('no accede a datos (from/storage/channel/rpc/functions) vía supabase-js', () => {
    const violaciones: string[] = [];
    for (const { absoluta, relativa } of FUENTES) {
      const contenido = soloCodigo(readFileSync(absoluta, 'utf8'));
      for (const { patron, motivo } of PATRONES_PROHIBIDOS) {
        if (patron.test(contenido)) violaciones.push(`${relativa}: ${motivo}`);
      }
    }
    expect(violaciones, 'Los datos deben ir por la API (/api), no por supabase-js').toEqual([]);
  });

  it('solo los módulos de auth/sesión instancian createClient', () => {
    const violaciones: string[] = [];
    for (const { absoluta, relativa } of FUENTES) {
      const permitido = PERMITEN_CREATECLIENT.some(
        (prefijo) => relativa === prefijo || relativa.startsWith(prefijo)
      );
      if (permitido) continue;
      const contenido = readFileSync(absoluta, 'utf8');
      if (/\bcreateClient\b/.test(contenido)) violaciones.push(relativa);
    }
    expect(
      violaciones,
      'Usa los helpers de lib/auth/sesion.ts o lib/api/cliente.ts en lugar de createClient directo'
    ).toEqual([]);
  });
});
