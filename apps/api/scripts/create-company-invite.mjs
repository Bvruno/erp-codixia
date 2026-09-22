#!/usr/bin/env node
/**
 * Crea una empresa nueva (org + ajustes por defecto) y genera el
 * link de invitación para el dueño. El dueño abre el link, crea su
 * cuenta y reclama la empresa completando el onboarding.
 *
 * Uso:
 *   node apps/api/scripts/create-company-invite.mjs --name "Codixia"
 *   node apps/api/scripts/create-company-invite.mjs --name "Mi Empresa" --days 14
 *
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en
 * apps/api/.env.local (o entorno). Idempotente: falla si ya existe
 * una empresa con el mismo nombre.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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
  const args = { name: null, role: 'admin', days: 7, base: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--name') args.name = argv[++i];
    else if (arg === '--role') args.role = argv[++i];
    else if (arg === '--days') args.days = parseInt(argv[++i], 10);
    else if (arg === '--base') args.base = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv();

  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  // apps/api/.env.local es para desarrollo local (localhost); los links
  // de producción no deben apuntar ahí salvo --base explícito.
  const envBase = env.WEB_ORIGIN?.replace(/\/+$/, '') ?? '';
  const baseUrl =
    args.base?.replace(/\/+$/, '') ||
    (envBase && !envBase.includes('localhost') ? envBase : null) ||
    'https://erp-codixia.onrender.com';

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error(
      'ERROR: faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (en apps/api/.env.local o entorno).'
    );
    process.exit(1);
  }
  if (!args.name?.trim()) {
    console.error('ERROR: usa --name "Nombre de la empresa"');
    process.exit(1);
  }
  if (args.role !== 'admin' && args.role !== 'collaborator') {
    console.error('ERROR: --role debe ser admin o collaborator');
    process.exit(1);
  }
  if (!Number.isFinite(args.days) || args.days < 1) {
    console.error('ERROR: --days debe ser un entero >= 1');
    process.exit(1);
  }

  const name = args.name.trim();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await admin
    .from('organizations')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle();

  if (existing) {
    console.error(`ERROR: ya existe la empresa "${existing.name}" (${existing.id}).`);
    process.exit(1);
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + args.days * 86400000).toISOString();

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name, owner_id: null })
    .select('id')
    .single();

  if (orgErr) {
    console.error('ERROR creando organización:', orgErr.message);
    process.exit(1);
  }

  const { error: settingsErr } = await admin.from('org_settings').upsert(
    {
      organization_id: org.id,
      daily_hours: 8,
      weekly_hours: 40,
      timezone: 'America/Mexico_City',
    },
    { onConflict: 'organization_id' }
  );

  if (settingsErr) {
    console.error('ERROR creando ajustes:', settingsErr.message);
    process.exit(1);
  }

  const { error: inviteErr } = await admin.from('invitations').insert({
    organization_id: org.id,
    token,
    created_by: null,
    expires_at: expiresAt,
    status: 'pending',
    role: args.role,
  });

  if (inviteErr) {
    console.error('ERROR creando invitación:', inviteErr.message);
    process.exit(1);
  }

  const link = `${baseUrl}/invitacion/${token}`;

  console.log('');
  console.log('=== Empresa creada ===');
  console.log(`  Organización: ${name} (${org.id})`);
  console.log(`  Rol invitación: ${args.role}`);
  console.log(`  Expira: ${expiresAt}`);
  console.log('');
  console.log('=== Link de invitación (enviar al dueño) ===');
  console.log(`  ${link}`);
  console.log('');
}

main().catch((err) => {
  console.error('ERROR inesperado:', err);
  process.exit(1);
});