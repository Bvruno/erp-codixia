# Modelo de permisos (v2) — ERP Codixia

Fuente de verdad: `public.entities` + `public.entity_visibility`, con las
funciones genéricas de `supabase/migrations/0072`–`0077`.

> Diagramas, flujos y casos completos: `docs/PERMISOS-FLUJOS.md`.

## Piezas

- **`entity_types`**: registro en datos de cada tipo de entidad
  (`clave`, `tabla`, `parent_expr`). Agregar un tipo nuevo no toca la
  lógica de permisos.
- **`entities`**: proyección canónica de jerarquía/visibilidad con los
  mismos UUID que las tablas de contenido. La mantienen triggers
  `BEFORE INSERT OR UPDATE OR DELETE` (`sync_entity_projection`); es
  interna (RLS activo sin policies).
- **`entity_visibility`**: grants (`read/write/manage`) + `inherit`,
  con FK a `entities` (el autor recibe `manage` automático vía
  `grant_creator_access`).
- **Funciones**: `entity_effective`, `entity_readable`,
  `entity_writable`, `entity_manageable`,
  `entity_navigation_visible`. `entity_permission`, `entity_org_id`,
  `entity_permissions_bulk` y `task_permission` son wrappers finos.

## Reglas

| Regla         | Detalle                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grant directo | Cuenta siempre, nivel completo (read/write/manage).                                                                                                           |
| Herencia      | Grants de ancestros con `inherit=true`; **solo `private` corta la herencia** (restringido hereda); nivel **capado a write** (heredar nunca permite eliminar). |
| Ver           | Efectivo ≠ null, o `access_mode='org'` + visibilidad `public`, o admin.                                                                                       |
| Crear         | `write` efectivo sobre el contenedor (padre) → no se puede crear dentro de algo invisible.                                                                    |
| Editar        | `write` efectivo (≥2).                                                                                                                                        |
| Eliminar      | `manage` efectivo (≥3) o ser el creador (manage directo).                                                                                                     |
| Compartir     | `manage` efectivo o admin; el perfil destino debe ser de la misma organización.                                                                               |
| Navegación    | Un ancestro se muestra si algún descendiente es legible (modo `grants_only`).                                                                                 |
| Organización  | Toda rama admin exige `organization_id = get_my_org_id()`.                                                                                                    |

## Agregar un tipo de entidad nuevo

1. Crear la tabla de contenido con `id`, `organization_id`, `workspace_id`,
   `folder_id` (nullable), `name`, `visibility`, `position`.
2. Registrar: `INSERT INTO entity_types (clave, tabla, parent_expr) VALUES
('nuevo', 'nuevos', 'coalesce(folder_id, workspace_id)');`
3. Trigger de proyección (BEFORE, para que los triggers de creador vean la
   fila): `CREATE TRIGGER trg_nuevos_entity_sync BEFORE INSERT OR UPDATE OR
DELETE ON nuevos FOR EACH ROW EXECUTE FUNCTION sync_entity_projection('nuevo');`
4. Trigger de creador: `CREATE TRIGGER trg_nuevos_creator_access AFTER INSERT
ON nuevos FOR EACH ROW EXECUTE FUNCTION grant_creator_access('nuevo');`
5. Generar policies: `SELECT rebuild_entity_policies();`
6. Agregar el tipo a `EntityType` (`packages/shared`) y `TIPO_ENTIDAD`
   (`apps/api`), y a la UI.

## Tests

Matriz RLS completa en `supabase/tests/permisos_matriz.sql` (transacción con
rollback). Local: `supabase start` y `npm run test:rls`. La suite valida
herencia, capado, crear-sin-ver, creador, compartir, `grants_only` y
aislamiento cross-tenant.
