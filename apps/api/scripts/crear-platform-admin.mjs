#!/usr/bin/env node
/**
 * Gestiona administradores de la plataforma (superadmins).
 *
 * Uso:
 *   node scripts/crear-platform-admin.mjs --listar
 *   node scripts/crear-platform-admin.mjs --email admin@dominio.com --password "Secreta123!"
 *   node scripts/crear-platform-admin.mjs --email admin@dominio.com --crear --password "Secreta123!"
 *   node scripts/crear-platform-admin.mjs --quitar admin@dominio.com
 *
 * --crear crea la cuenta auth si no existe. --password asigna/restablece
 * la contraseña (mínimo 6 caracteres); sin ella, la cuenta creada debe
 * usar "olvidé mi contraseña" para entrar.
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en apps/api/.env.local.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const envPath = resolve(root, '.env.local');
  if (!existsSync(envPath)) return process.env;
  const env = { ...process.env };
  for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in env)) env[key] = value;
  }
  return env;
}

function parseArgs(argv) {
  const args = { email: null, crear: false, quitar: null, listar: false, password: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--email') args.email = argv[++i];
    else if (arg === '--crear') args.crear = true;
    else if (arg === '--quitar') args.quitar = argv[++i];
    else if (arg === '--password') args.password = argv[++i];
    else if (arg === '--listar') args.listar = true;
  }
  return args;
}

async function buscarPorEmail(admin, email) {
  const objetivo = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const usuarios = data?.users ?? [];
    if (usuarios.length === 0) return null;
    const encontrado = usuarios.find((u) => (u.email ?? '').toLowerCase() === objetivo);
    if (encontrado) return encontrado;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv();
  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      'ERROR: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (en apps/api/.env.local o entorno).'
    );
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: actuales, error: errLista } = await admin
    .from('platform_admins')
    .select('user_id, created_at')
    .order('created_at', { ascending: true });
  if (errLista) {
    console.error('ERROR leyendo platform_admins:', errLista.message);
    process.exit(1);
  }

  if (args.listar || (!args.email && !args.quitar)) {
    if (actuales.length === 0) {
      console.log('No hay administradores de plataforma.');
      return;
    }
    for (const fila of actuales) {
      const usuario = await admin.auth.admin.getUserById(fila.user_id);
      console.log(`  ${usuario.data?.user?.email ?? fila.user_id}  (${fila.user_id})`);
    }
    return;
  }

  if (args.quitar) {
    const usuario = await buscarPorEmail(admin, args.quitar);
    if (!usuario) {
      console.error(`ERROR: no existe una cuenta con el correo ${args.quitar}.`);
      process.exit(1);
    }
    if (actuales.length <= 1) {
      console.error('ERROR: debe quedar al menos un administrador de plataforma.');
      process.exit(1);
    }
    const { error } = await admin
      .from('platform_admins')
      .delete()
      .eq('user_id', usuario.id);
    if (error) {
      console.error('ERROR quitando admin:', error.message);
      process.exit(1);
    }
    console.log(`Admin de plataforma quitado: ${usuario.email}`);
    return;
  }

  if (args.password != null && args.password.length < 6) {
    console.error('ERROR: --password debe tener al menos 6 caracteres.');
    process.exit(1);
  }

  let usuario = await buscarPorEmail(admin, args.email);
  if (!usuario && args.crear) {
    const { data, error } = await admin.auth.admin.createUser({
      email: args.email.trim().toLowerCase(),
      email_confirm: true,
      ...(args.password ? { password: args.password } : {}),
    });
    if (error) {
      console.error('ERROR creando cuenta:', error.message);
      process.exit(1);
    }
    usuario = data.user;
    console.log(
      args.password
        ? `Cuenta creada con contraseña: ${usuario.email}`
        : `Cuenta creada: ${usuario.email} (usa "olvidé mi contraseña" para entrar)`
    );
  }
  if (!usuario) {
    console.error(
      `ERROR: no existe una cuenta con ${args.email}. Usa --crear para crearla.`
    );
    process.exit(1);
  }

  if (args.password) {
    const { error } = await admin.auth.admin.updateUserById(usuario.id, {
      password: args.password,
    });
    if (error) {
      console.error('ERROR asignando contraseña:', error.message);
      process.exit(1);
    }
    console.log(`Contraseña actualizada: ${usuario.email}`);
  }

  const yaEsAdmin = actuales.some((fila) => fila.user_id === usuario.id);
  if (yaEsAdmin) {
    console.log(`Ya es admin de plataforma: ${usuario.email}`);
    return;
  }

  const { error } = await admin.from('platform_admins').insert({ user_id: usuario.id });
  if (error) {
    console.error('ERROR agregando admin:', error.message);
    process.exit(1);
  }

  console.log(`Admin de plataforma agregado: ${usuario.email} (${usuario.id})`);
}

main().catch((err) => {
  console.error('ERROR inesperado:', err);
  process.exit(1);
});
