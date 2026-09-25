#!/usr/bin/env node
// Ejecuta supabase/tests/permisos_matriz.sql contra el Postgres del stack
// local de Supabase (el script no es TAP, así que `supabase test db` no
// sirve: pg_prove exige plan()). Lee el project_id de supabase/config.toml
// para localizar el contenedor supabase_db_<project_id>.
import { createReadStream, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
if (!projectId) {
  console.error("ERROR: no se pudo leer project_id de supabase/config.toml");
  process.exit(1);
}

const container = `supabase_db_${projectId}`;
const ps = spawnSync(
  "docker",
  ["ps", "--filter", `name=${container}`, "--format", "{{.Names}}"],
  {
    encoding: "utf8",
  },
);
if (ps.error || !ps.stdout.split(/\r?\n/).includes(container)) {
  console.error(
    `ERROR: el contenedor ${container} no está corriendo. Ejecuta: npm run db:start`,
  );
  process.exit(1);
}

console.log(`RLS contra ${container} (supabase/tests/permisos_matriz.sql)`);
const child = spawn(
  "docker",
  [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "-",
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
createReadStream(resolve(root, "supabase/tests/permisos_matriz.sql")).pipe(
  child.stdin,
);
child.on("error", (err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
child.on("close", (code) => process.exit(code ?? 1));
