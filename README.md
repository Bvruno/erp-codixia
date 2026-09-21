# ERP Empresarial — plataforma de gestión de tareas, turnos y proyectos

Monorepo con separación total front/back:

```
apps/web/          → SPA (Vite + React 19 + TanStack Router)
apps/api/          → API (Hono + Zod + WebSocket realtime)
packages/shared/   → tipos, Zod schemas y lógica pura (contrato único)
supabase/          → migraciones y schema de la base (Supabase + RLS)
scripts/           → utilidades (seed, creación de invitaciones, bucket)
```

## Stack

- **Frontend**: Vite 8 + React 19 + TanStack Router (file-based) + Tailwind v4 + TanStack Query
- **Backend**: Hono (Node) + Zod — auth con JWT Bearer (Supabase Auth como IdP)
- **Datos**: Supabase (Postgres + RLS + Realtime); el SPA solo usa Supabase para auth/sesión — los datos pasan por la API
- **Realtime**: pasarela WebSocket en la API (`/cws`) → canales Supabase con el JWT del usuario (RLS aplica)
- **Tests**: Vitest (shared/api/web) + Playwright e2e (Edge/Chrome del sistema)

## Desarrollo local

```bash
npm install
# .env.local (raíz) para la API y apps/web/.env.local para el SPA:
#   SUPABASE_URL=           https://<ref>.supabase.co
#   SUPABASE_ANON_KEY=      anon key (pública)
#   SUPABASE_SERVICE_ROLE_KEY=  service role (SOLO server/scripts — nunca al navegador)
#   WEB_ORIGIN=             http://localhost:5173
#   PORT=                   8787
#   VITE_SUPABASE_URL=      (apps/web/.env.local, mismo valor)
#   VITE_SUPABASE_ANON_KEY= (apps/web/.env.local, mismo valor)
#   LOG_SUPABASE=1          traza de llamadas API → Supabase en consola (default: on fuera de prod)
#   CRON_SECRET=            secreto para POST /cron/recordatorios (Render Cron)
npm run dev:api   # API en http://localhost:8787 (salud: /salud)
npm run dev:web   # SPA en http://localhost:5173 (proxy /api y /cws a la API)
```

### Recordatorios de vencimiento (cron)

`POST /cron/recordatorios` (header `x-cron-secret: $CRON_SECRET`) revisa las
tareas próximas y crea notificaciones según `reminder_before` del destinatario
(dedupe por tarea + vencimiento). En Render: Cron Job con runtime Docker,
`dockerfilePath=apps/api/scripts/Dockerfile.cron` y env `API_URL` + `CRON_SECRET`
(`API_URL` es la base donde viven las rutas: `http://localhost:8787` en local o
`https://<host>/api` si la API va detrás de ese prefijo).
Prueba manual: `node apps/api/scripts/disparar-recordatorios.mjs`.

### Traza de flujo (dev)

Cada request de la API recibe un id; las llamadas a Supabase que provoca se
prefijan con el mismo id (y cada cliente con su etiqueta: `usuario`, `admin`,
`jwt`, `realtime`):

```
[api] #3 ← GET /invitaciones/token-inexistente
[supabase:jwt] #3 POST /rest/v1/rpc/get_invitation 200 900ms
[api] #3 → 404 907ms
```

Sin tokens ni emails en los logs (se redactan). Se apaga con `LOG_SUPABASE=0`.

## Comandos

| Comando | Descripción |
|---|---|
| `npm run dev:api` / `dev:web` | servidores de desarrollo |
| `npm run test` | todos los tests (shared + api + web) |
| `npm run test:shared` / `test:api` / `test:web` | tests por paquete |
| `npm run e2e -w @erp/web` | e2e Playwright (levanta api + web solos) |
| `npm run lint` | ESLint (apps + packages) |
| `npm run typecheck` | tsc en los tres paquetes |
| `npm run build -w @erp/web` | build de producción del SPA |
| `npm run seed` | seed demo en la BD configurada (service role) |

## Base de datos

- **BD nueva** → `supabase/schema.sql` completo (SQL Editor). Es el estado canónico consolidado.
- **BD existente** → migraciones delta por orden en `supabase/migrations/` (0001→0058+).
- El modelo de permisos vive en RLS: `entity_permission()` (CTE recursivo por ancestros),
  grants `read/write/manage` + herencia capada, helpers `SECURITY DEFINER` con `search_path` fijo.

## Seguridad (notas)

- Service role **solo** en `apps/api` (y scripts) — nunca en el bundle web.
- JWT verificado por request en la API (`supabase.auth.getUser`), perfil leído fresco de BD (blocked/rol/org no confían en claims del token).
- Realtime: la pasarela abre canales con el JWT del usuario → RLS aplica igual que antes; el navegador no expone anon key a Realtime (solo vía API).
- `/api/debug/*` solo admin; invitaciones con token hash SHA-256; audit_logs con RLS.
- `.npmrc` con credenciales locales: no commitear (gitignored).

## Reglas de desarrollo

Ver `AGENTS.md`: todo en español (identificadores, rutas REST, clases CSS BEM descriptivas, commits), TypeScript strict, Conventional Commits, validación Zod en todo input, >80% cobertura, navegador moderno sin polyfills.