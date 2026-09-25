# AGENTS.md — ERP Codixia

Instrucciones para agentes de IA que trabajen en este repositorio.

## Arquitectura (refactor completado)

Monorepo con separación total front/back — el SPA SOLO habla con Supabase
para auth/sesión (supabase-js browser, encapsulado en `apps/web/src/lib/auth/`);
todo lo demás pasa por la API:

- `apps/web/` → SPA: Vite 8 + React 19 + TanStack Router (file-based en
  `src/rutas/`, plugin genera `route-tree.gen.ts`) + Tailwind v4.
  Shims de compat: `src/next/link.tsx` y `src/next/navigation.ts`.
- `apps/plataforma/` → SPA del panel de owners (segundo front, puerto dev
  5174): funnel público `/solicitar` + panel `/solicitudes`, `/empresas`,
  `/planes`, `/facturas`, `/admins`, `/auditoria`, `/estadisticas`, `/telegram`
  (config del bot, eventos/plantillas e historial) y campana de notificaciones.
  Mismo contrato que web: supabase-js browser solo en `src/lib/auth/` y
  `src/lib/api/cliente.ts`; datos por `/plataforma/*` con Bearer. Guard
  propio en `src/arquitectura.test.ts`.
- `apps/api/` → Hono + Zod. Rutas en `src/rutas/`, middleware JWT en
  `src/middleware/`, pasarela realtime en `src/realtime/pasarela-ws.ts`.
  Scripts admin (service role) en `apps/api/scripts/`: seed, bucket de mapas,
  invitación de empresas, bootstrap de platform admins
  (`crear-platform-admin.mjs`), cron de recordatorios y de plataforma
  (`disparar-plataforma.mjs`).
- `packages/shared/` → tipos + lógica pura + errores (contrato único; web y
  api importan solo de aquí). Aliases legacy `@/lib/*` → `shared/src/logica`.
- `supabase/` → `schema.sql` (estado consolidado para BD nueva por SQL
  Editor) + `migrations/` espejo exacto del historial de producción (32
  versiones timestamp; el bootstrap local las aplica con `npm run db:reset`).
  Las migraciones históricas 0001→0081 individuales quedan como referencia en
  `supabase/migrations-legacy/` (no re-aplicables: en producción se aplicaron
  squash como delta_0001_0012…delta_0049_0058). Tests RLS en
  `supabase/tests/permisos_matriz.sql` con `npm run test:rls` (stack local).
  Stack local: `npm run db:start` / `db:stop` / `db:reset`, puertos 5442x
  (coexiste con otros stacks locales; config en `supabase/config.toml`).
- Permisos (v2, migraciones 0072→0077): jerarquía/visibilidad unificadas en
  `entities` (proyección por triggers desde las tablas de contenido) + grants
  en `entity_visibility`. Reglas: herencia capada a write y solo `private` la
  corta; crear exige write efectivo del contenedor visible; compartir exige
  manage; admin siempre aislado por org. Tipo nuevo = fila en `entity_types` +
  trigger de sync + `SELECT rebuild_entity_policies()`. Detalle y pasos en
  `docs/PERMISOS.md`; no duplicar la lógica en la API ni en el SPA.
- Realtime: `/cws` (WS) → setSession con access+refresh del SPA → canales
  Supabase con JWT del usuario (RLS aplica). `apps/web/src/lib/realtime.ts`
  expone `canalRealtime()` compatible con `supabase.channel()`.
- Datos vía API (migración completada): TODAS las rutas de datos encadenan
  `clienteUsuarioMiddleware` (`apps/api/src/lib/supabase/usuario.ts`). El
  middleware recrea la sesión del usuario con setSession(access+refresh)
  sobre cliente anon-key → RLS aplica con auth.uid() (los permisos se
  deciden en BD, sin replicar `entity_effective` en la API). El SPA envía
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
- Plataforma SaaS (0067–0070): `platform_admins` (superadmins fuera de toda
  org), `owner_applications` (funnel público con aprobación manual),
  `organizations.status` (`activa|suspendida` bloquea a todos los miembros vía
  middleware), `plans`/`org_subscriptions`/`billing_records` (facturación
  manual, sin pasarela) y `platform_audit_logs`. Todas con RLS ON sin policies
  + REVOKE: solo service role. Rutas `/plataforma/*`: `POST /solicitudes` es
  público (rate limit + honeypot + IP hasheada); el resto exige JWT +
  `requerirPlataforma` (`apps/api/src/middleware/requerir-plataforma.ts`).
  Crear empresas/owners sigue el flujo de invitaciones existente
  (`crearEmpresaConInvitacion` en `apps/api/src/rutas/plataforma/comun.ts`).
  Primer superadmin: `node apps/api/scripts/crear-platform-admin.mjs
  --email <correo> --crear` (lee `apps/api/.env.local`).
- Telegram de plataforma (0078): bot único (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`
  del entorno como valor inicial, config real en `platform_telegram_config`),
  catálogo de 20 eventos con plantillas en `platform_telegram_eventos`, log en
  `platform_telegram_envios` y campana en `platform_notifications(+reads)`.
  El núcleo es `apps/api/src/lib/telegram-plataforma.ts` (`emitirEvento`,
  best-effort: campana + envío con nivel mínimo, agrupación de errores, horario
  de silencio y rate limit) y `lib/telegram-bot.ts` (getMe/webhook/getUpdates,
  comandos `/start`, `/id`, `/estado`). Rutas `/plataforma/telegram/*`
  (JWT + `requerirPlataforma`) más `POST /plataforma/telegram/webhook/:secret`
  público con secret; el cron `POST /cron/plataforma` hace polling, avisa de
  facturas vencidas/empresas sin owner/owners inactivos/límites y envía el
  resumen diario (`scripts/disparar-plataforma.mjs`). Los errores nuevos ya NO
  alertan al owner: notifican a la plataforma (`emitirErrorPlataforma`). El
  submódulo del panel es `@erp/shared/telegram-plataforma`.

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
- UI: `apps/web/DESIGN.md` + `apps/web/.impeccable/design.json` son el contrato
  visual normativo (tokens, componentes, reglas) y `apps/web/PRODUCT.md` el
  contexto de producto; `apps/web/src/estilos/globals.css` es la fuente de los
  tokens. Paquete exportable a Open Design en `design-system/` (mantener en
  sync al cambiar tokens).
- Tests: `npm run test` (vitest, por workspace:
  `test:shared`/`test:api`/`test:web`/`test:plataforma`);
  e2e: `npm run e2e -w @erp/web` (Playwright, Edge del sistema);
  lint `npm run lint` (eslint apps+packages); typecheck `npm run typecheck`.
- Migraciones de Supabase versionadas en `supabase/migrations/` (espejo del
  historial remoto); nunca renumerar ni reordenar versiones ya aplicadas.
- Env: cada capa lee SU PROPIO `.env.local`, nunca fuera. `.env.local` apunta
  al Supabase LOCAL (127.0.0.1:5442x); `.env.prod` es solo el snapshot de
  producción (Render usa env vars del dashboard; `.env.prod` no se carga
  automáticamente). API/scripts: `apps/api/.env.local`
  (SUPABASE_URL/ANON/SERVICE_ROLE/WEB_ORIGIN, PLATFORM_ORIGIN opcional para
  CORS del panel, cargado con `--env-file=.env.local`); SPA:
  `apps/web/.env.local` (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY); panel:
  `apps/plataforma/.env.local` (mismas VITE_* + VITE_API_URL). Ejemplos en
  `apps/api/.env.example`, `apps/web/.env.example` y
  `apps/plataforma/.env.example`; la raíz no tiene env.
  Traza de flujo API → Supabase en consola: `LOG_SUPABASE` (default on fuera de
  producción; lógica en `apps/api/src/lib/log.ts`, id por request + llamadas
  de cada cliente con etiqueta `usuario|admin|jwt|realtime`).
- Service role key SOLO en api/scripts; nunca en web ni en plataforma.
- Al editar `apps/web/src/rutas/` o `apps/plataforma/src/rutas/`: regenerar
  `route-tree.gen.ts` (vite dev lo hace al arrancar) si cambian las rutas.
- Historial: este repo fue migrado desde Next.js App Router; no reintroducir
  imports de `next/*` (usar los shims o TanStack Router).