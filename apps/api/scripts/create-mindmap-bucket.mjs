#!/usr/bin/env node
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

async function main() {
  try {
    const { data: existing, error: listErr } = await admin.storage.getBucket('mindmap-images');
    if (!listErr && existing) {
      console.log('El bucket "mindmap-images" ya existe. Nada que hacer.');
      return;
    }
    const { error } = await admin.storage.createBucket('mindmap-images', {
      public: true,
      fileSizeLimit: 5242880,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
    });
    if (error) {
      console.error('ERROR creando el bucket:', error.message);
      process.exit(1);
    }
    console.log('Bucket "mindmap-images" creado (público, máx 5MB).');
  } catch (e) {
    console.error('ERROR:', e);
    process.exit(1);
  }
}

main();