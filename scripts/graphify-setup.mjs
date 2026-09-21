#!/usr/bin/env node
/**
 * graphify-setup — integra graphify en un proyecto opencode.
 *
 * Uso:  node scripts/graphify-setup.mjs [project_root]
 *
 * Pasos (idempotentes):
 *   1. `graphify update .`          — refresca el grafo (AST-only, sin LLM)
 *   2. `graphify hook install`      — rebuild automático post-commit
 *   3. .gitignore += /graphify-out/
 *   4. .opencode/opencode.json      — declara el MCP graphify con --graph explícito
 *   5. AGENTS.md                    — añade sección "Graphify" si no existe
 *
 * Requiere la CLI graphify instalada (uv tool install graphifyy, o
 * pip install graphifyy). Sin dependencias externas (solo fs + child_process).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());

function log(msg) {
  console.log(`[graphify-setup] ${msg}`);
}

function findPython() {
  const candidates = [];
  try {
    const uvDir = execFileSync('uv', ['tool', 'dir'], { encoding: 'utf8' }).trim();
    candidates.push(join(uvDir, 'graphifyy', 'Scripts', 'python.exe'));
  } catch {}
  try {
    const venvs = execFileSync('pipx', ['environment', '--value', 'PIPX_LOCAL_VENVS'], { encoding: 'utf8' }).trim();
    candidates.push(join(venvs, 'graphifyy', 'Scripts', 'python.exe'));
  } catch {}
  for (const py of candidates) {
    if (existsSync(py)) return py;
  }
  return 'graphify';
}

function run(py, args) {
  log(`$ ${py} ${args.join(' ')}`);
  try {
    const out = execFileSync(py, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    process.stdout.write(out);
  } catch (err) {
    log(`ERROR ejecutando ${args.join(' ')}:`);
    process.stderr.write(String(err.stdout || '') + String(err.stderr || '') + '\n');
    process.exit(1);
  }
}

function ensureGitignore() {
  const file = join(root, '.gitignore');
  if (!existsSync(file)) return;
  const content = readFileSync(file, 'utf8');
  if (content.includes('graphify-out/')) {
    log('.gitignore ya ignora graphify-out/');
    return;
  }
  writeFileSync(file, `${content.replace(/\n*$/, '\n')}\n# graphify: grafo de conocimiento (reproducible con \`graphify update\`)\n/graphify-out/\n`);
  log('.gitignore: /graphify-out/ añadido');
}

function ensureOpencodeConfig() {
  const dir = join(root, '.opencode');
  const file = join(dir, 'opencode.json');
  let cfg = { $schema: 'https://opencode.ai/config.json' };
  if (existsSync(file)) {
    try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch {
      log(`AVISO: ${file} tiene JSON inválido; no se modificó. Añade el MCP graphify a mano.`);
      return;
    }
  }
  if (cfg.mcp?.graphify) {
    log('.opencode/opencode.json ya declara el MCP graphify');
    return;
  }
  cfg.mcp = cfg.mcp || {};
  cfg.mcp.graphify = {
    type: 'local',
    command: [findPython(), '-m', 'graphify.serve', '--graph', 'graphify-out/graph.json'],
    enabled: true,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  log('.opencode/opencode.json: MCP graphify registrado (--graph explícito)');
}

function ensureAgents() {
  const file = join(root, 'AGENTS.md');
  const section = `## Graphify: grafo de conocimiento

Este proyecto mantiene un knowledge graph del código en \`graphify-out/\`
(ignorado en git; reproducible con \`graphify update .\`). El server MCP
\`graphify\` (configurado en \`.opencode/opencode.json\`) sirve ese grafo.

Reglas de uso:

- **Grafo primero**: para preguntas de arquitectura, relaciones entre
  archivos, quién llama a qué, o impacto de cambios, consulta las tools de
  graphify ANTES de grepear archivos: \`graphify_query_graph\`,
  \`graphify_get_node\`, \`graphify_get_neighbors\`, \`graphify_god_nodes\`,
  \`graphify_shortest_path\`. El subgrafo devuelto es mucho más pequeño que
  leer archivos crudos.
- **Contexto amplio**: lee \`graphify-out/GRAPH_REPORT.md\` solo para contexto
  general de arquitectura (god nodes, comunidades, conexiones sorpresa).
- **PRs**: \`graphify_list_prs\` / \`graphify_triage_prs\` / \`graphify_get_pr_impact\`
  antes de revisar o planear cambios en áreas que otro PR ya toca.
- **Actualización**: el hook post-commit reconstruye el grafo tras cada
  commit. Si el árbol de trabajo cambió mucho sin commitear y el grafo parece
  desactualizado, ejecuta \`graphify update .\` antes de consultar.
- **No editar** \`graphify-out/\` a mano: es un artefacto generado.
`;
  if (!existsSync(file)) {
    writeFileSync(file, `# AGENTS.md\n\n${section}`);
    log('AGENTS.md creado con sección Graphify');
    return;
  }
  const content = readFileSync(file, 'utf8');
  if (content.includes('Graphify: grafo de conocimiento')) {
    log('AGENTS.md ya tiene la sección Graphify');
    return;
  }
  writeFileSync(file, `${content.replace(/\n*$/, '\n')}\n${section}`);
  log('AGENTS.md: sección Graphify añadida');
}

log(`Proyecto: ${root}`);
const py = findPython();
log(`Interpreter: ${py}`);

run(py, ['-m', 'graphify', 'update', '.']);
run(py, ['-m', 'graphify', 'hook', 'install']);
ensureGitignore();
ensureOpencodeConfig();
ensureAgents();

log('Listo. Reinicia opencode para que el MCP graphify tome el nuevo opencode.json.');