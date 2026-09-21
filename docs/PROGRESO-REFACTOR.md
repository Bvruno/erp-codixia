# Progreso — Refactor ERP Empresarial (rama `refactor/erp-empresarial`)

Separación total front/back: Hono (API) + Vite/TanStack Router (SPA). Supabase dev dedicado. Legacy Next intacto en `main`.

## Estado

| Fase | Estado |
|---|---|
| 0 — Rama + Supabase dev + seguridad | 🔄 en curso |
| 1 — Monorepo + mover shared/components | ⏳ pendiente |
| 2 — Borrar legacy Next | ⏳ pendiente |
| 3 — API Hono + tests | ⏳ pendiente |
| 4 — SPA Vite/TanStack + auth PKCE | ⏳ pendiente |
| 5 — Realtime WS gateway | ⏳ pendiente |
| 6 — e2e + perf + docs | ⏳ pendiente |
| 7 — Deploy Render (post-aprobación) | ✅ |

## Fase 0 — Rama + Supabase dev + seguridad

- [x] Rama `refactor/erp-empresarial` creada desde `main`
- [x] Proyecto Supabase dev `erp-empresarial` creado (ref `zkklwdtuislnkobeqwxv`, free, ca-central-1, $0/mes)
- [x] Migraciones seguridad 0056/0057/0058 escritas (`supabase/migrations/`)
- [x] Migraciones 0001→0058 aplicadas a BD dev (idempotentes; ver notas)
- [x] `.env.local` apuntando a proyecto dev (URL + anon key)
- [x] `npm audit fix` (33 vulns restantes: 32 moderate + 1 high cadena exceljs→uuid, fix rompería export; se resuelve en Fase 3)
- [ ] **PENDIENTE Bruno**: `SUPABASE_SERVICE_ROLE_KEY` del proyecto dev en `.env.local` (Settings → API Keys)
- [ ] **PENDIENTE Bruno**: Redirect URLs en dashboard dev: `http://localhost:5173/**` (auth PKCE + Google OAuth)
- [ ] **PENDIENTE Bruno**: Leaked-password protection ON en dashboard dev
- [ ] Seed demo (bloqueado por service role key)

### Notas de aplicación (hallazgos de drift, corregidos solo en dev)

- `schema.sql` NO es canónico real: faltan 0037/0044/0054/0055 etc. → dev usa deltas 0001→0058 (reproduce prod exacto). Consolidar schema.sql queda como deuda futura.
- `task_activity_log` (timeline) vivía en `timeline.sql` suelto (aplicado a mano en prod); en dev se creó dentro de la aplicación de 0033.
- 0008 definía funciones SQL sin calificar con search_path='' → PG17 rechaza; se aplicó con `check_function_bodies=off` (mismo truco de 0023).
- El tool MCP re-ejecuta la query en la misma transacción (doble-pass) → los chunks se blindaron idempotentes (DROP IF EXISTS / IF NOT EXISTS / DO-guards en publications).
- Seguridad verificada en dev: `audit_logs` RLS ON (prod NO lo tenía — crítico), `claim_organization` revocado de anon/authenticated (prod lo tenía — org takeover), `log_error`/`has_schedule`/`is_org_owner` revocados de anon. Advisors: 0 errores RLS-disabled.

## Fase 1 — Monorepo + mover shared/components ⏳→✅ (parcial)

- [x] npm workspaces: `apps/*` + `packages/*`; scripts `dev:api`/`dev:web`/`test:shared`/`test:api`/`test:web`
- [x] `packages/shared`: tipos + lógica pura movida (hours, schedules, slugs, task-errors, access, task-config, todo-config, mindmap-*, shift-utils, invites, logger, errores núcleo) — 158 tests ✓ typecheck ✓
- [x] `apps/api`: skeleton Hono (/salud, config zod) + lib movida (supabase, audit, telegram-alert, org-export, captura-errores server) — 34 tests ✓ typecheck ✓
- [x] `apps/web`: skeleton Vite + TanStack Router + Tailwind v4 + route-tree generado; components movidos (62 archivos, git mv)
- [x] **Idioma: multi-idioma eliminado** — `profiles.language` fijo `"es"`, fila "Idioma" + icono Languages fuera, formatters UI es-ES (todo-config mantiene en-US interno para mapeo getDay)
- [ ] Pendiente Fase 4: typecheck web (components legacy con imports next/*), aliases @/lib/* en web hacia shared

### Ajustes vs plan original
- Components NO se portaron en Fase 1 (se movieron a apps/web tal cual; imports legacy se arreglan en Fase 4 junto al port de datos)
- errors.ts dividido: núcleo puro → shared; capture server → api; capture client → web
- `priorityLabel` colisionaba (task-config vs mindmap-config) → mindmap renombrada a `etiquetaPrioridad`

## Fase 2 — Borrar legacy Next ✅

- [x] `src/app`, `src/middleware.ts`, `src/instrumentation.ts`, `next.config.ts`, `.next/` eliminados
- [x] `public/` legacy: solo `robots.txt` movido a apps/web; svgs template borrados
- [x] Deps Next fuera de raíz: `next`, `@supabase/ssr`, `eslint-config-next`; scripts legacy fuera
- [x] `src/lib/auth`: acciones server (Next) ELIMINADAS — Fase 3 las reimplementa como rutas Hono; conservados `oauth.ts`, `error-auth.ts` (lógica pura) en api
- [x] `supabase/server.ts`+`client.ts` (cookies SSR) eliminados — Fase 3/4 usan JWT Bearer
- [x] `vitest.setup.ts` → `apps/web/src/test/setup.ts`
- Estado: shared 158 tests ✓ · api 48 tests ✓ typecheck ✓ · web typecheck pendiente Fase 4 (componentes legacy)

## Fase 3 — API Hono (pendiente)

## Fase 3 — API Hono ✅ (validación end-to-end COMPLETADA)

- [x] **Flujo real validado en vivo (dev)**: usuario `owner.demo@demo.com` creado vía admin API (service role key correcta) → login → `/auth/estado` (collaborator sin org) → invitación pública (Empresa Demo, admin) → aceptar → redirect `/onboarding` → onboarding (claim_organization + settings) → `/auth/estado` final: **role admin, org asignada, onboarding_pending false, is_owner=true** (verificado en BD)
- [x] `claim_organization` endurecida (0057) funciona vía service role: membership check OK

- [x] `app.ts` (testeable) + `index.ts` (serve); CORS WEB_ORIGIN; /salud verificado en vivo (200)
- [x] Middleware: `verificar-jwt` (Bearer → getUser + perfil fresco de BD), `requerir-admin`
- [x] Rutas: `/auth` (login, signup con invitación, reset, nueva-password, oauth/decide, onboarding, estado)
- [x] `/invitaciones` (obtener, aceptar con sanitización de grants, rechazar, crear con reglas owner/admin, cancelar, grants)
- [x] `/organizacion` (perfil, exportar JSON, exportar.xlsx con exceljs, sesiones, eliminar)
- [x] `/telegram` (enviar, probar), `/miembros` (PATCH), `/storage/mindmap-imagenes`, `/errores` (telemetría + alerta server-side), `/debug` (admin)
- [x] Flujos legacy portados de actions.ts (login/signup/accept/createInvitation/grants) + oauth.ts/error-auth.ts
- [x] Tests de rutas con mocks (app.request): 55 tests ✓ typecheck ✓
- [ ] **PENDIENTE**: Bruno puso la *publishable* key como service role en .env.local (Unauthorized en admin API) — necesita la **service role key real** del proyecto dev (Settings → API Keys). Sin ella, flujos admin (invitaciones, onboarding, export) fallan en vivo.

## Fase 4 — SPA Vite/TanStack ✅ (data access directo pendiente de migración por dominio)

- [x] 27 páginas recuperadas de git (estaban en src/app borrado) → `apps/web/src/paginas/`
- [x] Shims: `next/link`, `next/navigation` (TanStack), `@/lib/supabase/client` (browser), `@/lib/auth/actions` (fetch API), `@/lib/errors`
- [x] Páginas server→client: login, signup (valida invitación por API), reset-password, onboarding, inicio, calendario
- [x] Rutas TanStack con guards: `_aplicacion` (sesión + onboarding + perfil vía /auth/estado), públicas (login/signup/forgot/reset/invitacion), deep proyectos ($id/$folder/$list/tarea/documento/mapa/todo)
- [x] Typecheck web 0 errores; tests web 56 ✓; vite dev sirve todas las páginas (200)
- [x] Fixes: vite 8 (plugin-react 6), tiptap unificado 3.31.3 (overrides), BOM/UTF-16 en extracciones, `hashInviteToken` async (Web Crypto portable)
- [x] Migración de acceso a datos completada (post-refactor): el SPA ya no usa
  supabase browser para datos — solo auth/sesión (`lib/auth/sesion.ts` +
  `lib/auth/actions.ts`), tokens de realtime (`lib/realtime.ts`) y Bearer
  (`lib/api/cliente.ts`). Telemetría vía `POST /errores` (API, service role).
  Guard automatizado: `apps/web/src/arquitectura.test.ts` falla ante
  `supabase.from/storage/channel/rpc/functions` o `createClient` fuera de la
  allowlist.

## Fase 5 — Realtime WS ✅

- [x] Pasarela `/cws` en api (`@hono/node-ws`): auth (JWT) → `setSession` (access+refresh del SPA) → canal Supabase Realtime con RLS del usuario → relay de eventos al socket
- [x] `realtime-client.ts` (web): API compatible con `supabase.channel(...).on(...).subscribe()` + `send()` (broadcast) + reconexión con resuscribir
- [x] 9 componentes/páginas migrados de `supabase.channel` → `canalRealtime` (diffs mecánicos)
- [x] **Validado en vivo**: insert en `notes` → evento `postgres_changes` recibido por el socket (RLS aplica: solo el usuario ve su org)
- [x] Hallazgo clave: el transport realtime usa la sesión interna del client; `setSession` dispara `SIGNED_IN` async → hay que esperarlo antes de suscribir (race → canal mudo como anon). `refreshSession` también funciona pero rota el refresh del SPA (no usar)
- [x] Logs sin tokens (solo errores de canal)
- Estado: shared 169 ✓ · api 44 ✓ · web 56 ✓ · typechecks 0 errores

## Fase 6 — e2e + perf + docs ✅

- [x] **Playwright e2e** (3/3 ✓): login inválido muestra error, login válido entra a /calendario, ruta protegida redirige — Edge del sistema (channel msedge), webServer levanta api+web solos
- [x] Fixes de e2e: `apps/web/.env.local` (Vite no lee el root), BOM en env files, proxy vite `/api` con rewrite (el API no tiene prefijo /api)
- [x] **Perf**: code-splitting por ruta (`autoCodeSplitting` del router plugin) — bundle inicial 98KB gzip (presupuesto <200KB); tiptap/xyflow quedan en chunks lazy
- [x] **Build prod** ✓ (vite 8/rolldown; `fast-equals` añadida por overrides de tiptap)
- [x] **Lint**: eslint config nuevo (typescript-eslint + react-hooks) — 0 errores, 7 warnings (unused menores)
- [x] README reescrito (monorepo, env, comandos, seguridad) + `.env.example` (raíz y web) + `.gitignore` (dist/.tanstack/test-results)
- [x] AGENTS.md actualizado con arquitectura nueva

## Estado final del refactor

| Fase | Estado |
|---|---|
| 0 — Rama + Supabase dev + seguridad | ✅ |
| 1 — Monorepo + shared | ✅ |
| 2 — Borrar legacy Next | ✅ |
| 3 — API Hono + validación end-to-end | ✅ |
| 4 — SPA Vite/TanStack | ✅ |
| 5 — Realtime WS | ✅ |
| 6 — e2e + perf + docs | ✅ |
| 7 — Deploy Render | ✅ |

Deuda resuelta (acceso a datos): los componentes ya no leen/escriben con
supabase browser + RLS directo — ese acceso quedó solo para auth/sesión,
encapsulado en `lib/auth/**` y protegido por `apps/web/src/arquitectura.test.ts`.
Pendiente menor: web typecheck no cubre legacy `src/next/*` shims (by design).

## Fase 7 — Deploy Render ✅ (2026-09-19)

- **Web**: servicio `erp-caroline-salas` (`srv-da4ajef10e5c73b6l44g`) sirve el SPA
  desde `refactor/erp-empresarial`:
  `build: npm install; npm run build -w @erp/web`,
  `start: npm run start -w @erp/web` (`servidor.mjs`: estático + fallback SPA),
  health `/`. URL intacta: https://erp-caroline-salas.onrender.com
- **API**: servicio nuevo `erp-caroline-salas-api`
  (https://erp-caroline-salas-api.onrender.com): `npm install` +
  `npm run start -w @erp/api`, health `/salud`, env desde `.env.prod` (sin
  `PORT`), `LOG_SUPABASE=0`, `NODE_VERSION=22.12.0`.
- **Cron**: `erp-recordatorios` (Docker `apps/api/scripts/Dockerfile.cron`),
  `0 14 * * *` UTC (9:00 Perú), `API_URL` + `CRON_SECRET`.
- **SPA**: base de API por `VITE_API_URL`/`VITE_WS_URL` (cross-origin con CORS
  de `WEB_ORIGIN`; el gateway `/cws` no valida origen).
- **Supabase prod** (`szfnytutqdhapvkonuuu`): migraciones 0056, 0057,
  0059→0066 aplicadas (aditivas; conteos de filas idénticos al baseline),
  `0058` post-switch, bucket `mindmap-images` creado vacío (público 5MB).
  Auth: redirects `/login` y `/restablecer-password` agregados
  (comodines dominio prod + localhost:5173).
- **Pendiente**: leaked password protection requiere plan Pro; rotar
  service role/PAT/Render key/password BD tras la migración.

## Decisiones

- **Rama**: `refactor/erp-empresarial` — main intocada, legacy Next se elimina solo en esta rama
- **Naming**: todo nuevo usa "ERP Empresarial" (`@erp/web`, `@erp/api`, `@erp/shared`)
- **BD dev**: se aplican migraciones delta 0001→0058 en orden (reproduce prod exacto); `schema.sql` canónico queda para greenfield futuro
- **Seguridad**: las 3 fixes se crean como deltas 0056-0058 (aplican también a prod en Fase 7)

## Bloqueos / pendientes de verificación

- [x] Bucket `mindmap-images`: público 5MB creado en prod (y dev) con
  `scripts/create-mindmap-bucket.mjs` (vacío)
- [x] Service role key del proyecto dev: configurada en `.env.local`
- [x] Redirect URLs auth en proyecto dev/prod (dominio Render + localhost:5173)
- [ ] Security headers: el servicio web Node no los agrega → Cloudflare delante
- [ ] Rotar credenciales usadas en la migración (service role, PAT, Render API
  key, password BD)

## Cómo probar lo avanzado

Comandos en README (`npm run dev:api`, `npm run dev:web`, `npm test`,
`npm run e2e -w @erp/web`). En producción: SPA en
https://erp-caroline-salas.onrender.com y API en
https://erp-caroline-salas-api.onrender.com/salud.