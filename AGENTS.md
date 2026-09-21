# AGENTS.md — ERP Empresarial (antes Caroline Salas)

Instrucciones para agentes de IA que trabajen en este repositorio.

## Arquitectura (refactor completado)

Monorepo con separación total front/back — el SPA SOLO habla con Supabase
para auth/sesión (supabase-js browser, encapsulado en `apps/web/src/lib/auth/`);
todo lo demás pasa por la API:

- `apps/web/` → SPA: Vite 8 + React 19 + TanStack Router (file-based en
  `src/rutas/`, plugin genera `route-tree.gen.ts`) + Tailwind v4.
  Shims de compat: `src/next/link.tsx` y `src/next/navigation.ts`.
- `apps/api/` → Hono + Zod. Rutas en `src/rutas/`, middleware JWT en
  `src/middleware/`, pasarela realtime en `src/realtime/pasarela-ws.ts`.
- `packages/shared/` → tipos + lógica pura + errores (contrato único; web y
  api importan solo de aquí). Aliases legacy `@/lib/*` → `shared/src/logica`.
- `supabase/` → schema.sql canónico + migraciones delta 0001→0058.
- Realtime: `/cws` (WS) → setSession con access+refresh del SPA → canales
  Supabase con JWT del usuario (RLS aplica). `apps/web/src/lib/realtime.ts`
  expone `canalRealtime()` compatible con `supabase.channel()`.
- Datos vía API (migración completada): TODAS las rutas de datos encadenan
  `clienteUsuarioMiddleware` (`apps/api/src/lib/supabase/usuario.ts`). El
  middleware recrea la sesión del usuario con setSession(access+refresh)
  sobre cliente anon-key → RLS aplica con auth.uid() (los permisos se
  deciden en BD, sin replicar entity_permission en la API). El SPA envía
  `Authorization: Bearer` + `X-Refresh-Token` en cada request
  (`apps/web/src/lib/api/cliente.ts` → `apiFetch`/`api.get/post/patch/put/delete`;
  errores como `ErrorApi{status, code}`). Los clientes se cachean por
  access_token (TTL = exp del JWT). Service role SOLO en rutas admin
  (debug/telegram/exports/storage upload/miembros).
- Rutas de datos: `/entidades`, `/tareas`, `/documentos`, `/mapas`,
  `/todos`, `/calendario`, `/horarios`, `/perfil`, `/colaboradores`,
  `/auditoria` — passthrough RLS con validación zod, respuestas `{error}`.
- Excepciones de acceso directo del SPA: SOLO auth/sesión con supabase-js,
  concentrado en `lib/auth/**` (`sesionActual()` en `lib/auth/sesion.ts` es la
  vía para leer la sesión; login/logout/reset/oauth en `lib/auth/actions.ts`),
  más `lib/realtime.ts` (tokens para `/cws`) y `lib/api/cliente.ts` (Bearer +
  refresh). PROHIBIDO en el SPA: `supabase.from/storage/channel/rpc/functions`.
  La telemetría va por `POST /errores` (API → RPC `log_error` con service
  role; 0058 revocó anon/authenticated). El guard
  `apps/web/src/arquitectura.test.ts` falla si se rompe esta regla.

## Graphify: grafo de conocimiento

Este proyecto mantiene un knowledge graph del código en `graphify-out/`
(ignorado en git; reproducible con `graphify update .`). El server MCP
`graphify` (configurado en `opencode.json`, raíz del repo) sirve ese grafo.

Reglas de uso:

- **Grafo primero**: para preguntas de arquitectura, relaciones entre
  archivos, quién llama a qué, o impacto de cambios, consulta las tools de
  graphify ANTES de grepear archivos: `graphify_query_graph`,
  `graphify_get_node`, `graphify_get_neighbors`, `graphify_get_community`,
  `graphify_god_nodes`, `graphify_graph_stats`, `graphify_shortest_path`.
  El subgrafo devuelto es mucho más pequeño que leer archivos crudos.
- **Contexto amplio**: lee `graphify-out/GRAPH_REPORT.md` solo para contexto
  general de arquitectura (god nodes, comunidades, conexiones sorpresa).
- **Exploración visual**: `graphify-out/graph.html` (abrir en browser).
- **PRs**: `graphify_list_prs` / `graphify_triage_prs` / `graphify_get_pr_impact`
  antes de revisar o planear cambios en áreas que otro PR ya toca.
- **Actualización**: el hook post-commit reconstruye el grafo tras cada
  commit. Si el árbol de trabajo cambió mucho sin commitear y el grafo parece
  desactualizado, ejecuta `graphify update .` antes de consultar.
- **No editar** `graphify-out/` a mano: es un artefacto generado.

## Convenciones del proyecto

- TypeScript strict, SOLID/DRY/KISS, Conventional Commits. Todo en español
  (identificadores, rutas REST, commits, UI, clases CSS BEM descriptivas).
- Tests: `npm run test` (vitest, por workspace: `test:shared`/`test:api`/`test:web`);
  e2e: `npm run e2e -w @erp/web` (Playwright, Edge del sistema);
  lint `npm run lint` (eslint apps+packages); typecheck `npm run typecheck`.
- Migraciones de Supabase versionadas en `supabase/migrations/`.
- Env: la API lee `.env.local` raíz (SUPABASE_URL/ANON/SERVICE_ROLE/WEB_ORIGIN);
  el SPA lee `apps/web/.env.local` (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY).
  Traza de flujo API → Supabase en consola: `LOG_SUPABASE` (default on fuera de
  producción; lógica en `apps/api/src/lib/log.ts`, id por request + llamadas
  de cada cliente con etiqueta `usuario|admin|jwt|realtime`).
- Service role key SOLO en api/scripts; nunca en web.
- Al editar `apps/web/src/rutas/`: regenerar `route-tree.gen.ts` (vite dev lo
  hace al arrancar) si cambian las rutas.
- Historial: este repo fue migrado desde Next.js App Router; no reintroducir
  imports de `next/*` (usar los shims o TanStack Router).