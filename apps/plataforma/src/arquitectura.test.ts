/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard de arquitectura del panel de plataforma (mismo contrato que apps/web):
// supabase-js browser SOLO para auth/sesión; los datos van siempre por la API.
// El service role y las tablas platform_* jamás se tocan desde el SPA.

const RAIZ_SRC = resolve(process.cwd(), 'src');

const PERMITEN_CREATECLIENT = [
  'lib/supabase/client.ts',
  'lib/auth/',
  'lib/api/cliente.ts',
];

const PATRONES_PROHIBIDOS: { patron: RegExp; motivo: string }[] = [
  {
    patron: /\bsupabase\s*\.\s*(from|storage|channel|rpc|functions)\b/,
    motivo: 'acceso a datos vía supabase-js',
  },
  {
    patron: /createClient\s*\(\s*\)\s*\.\s*(from|storage|channel|rpc|functions)\b/,
    motivo: 'acceso a datos vía supabase-js',
  },
  {
    patron: /SERVICE_ROLE/,
    motivo: 'la service role key nunca viaja al navegador',
  },
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

function soloCodigo(contenido: string): string {
  return contenido
    .split('\n')
    .filter((linea) => {
      const t = linea.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

describe('arquitectura: el panel solo usa Supabase para auth/sesión', () => {
  it('no accede a datos vía supabase-js ni usa la service role', () => {
    const violaciones: string[] = [];
    for (const { absoluta, relativa } of FUENTES) {
      const contenido = soloCodigo(readFileSync(absoluta, 'utf8'));
      for (const { patron, motivo } of PATRONES_PROHIBIDOS) {
        if (patron.test(contenido)) violaciones.push(`${relativa}: ${motivo}`);
      }
    }
    expect(violaciones, 'Los datos deben ir por la API (/plataforma/*)').toEqual([]);
  });

  it('solo los módulos de auth/api instancian createClient', () => {
    const violaciones: string[] = [];
    for (const { absoluta, relativa } of FUENTES) {
      const permitido = PERMITEN_CREATECLIENT.some(
        (prefijo) => relativa === prefijo || relativa.startsWith(prefijo)
      );
      if (permitido) continue;
      const contenido = readFileSync(absoluta, 'utf8');
      if (/\bcreateClient\b/.test(contenido)) violaciones.push(relativa);
    }
    expect(violaciones).toEqual([]);
  });
});
