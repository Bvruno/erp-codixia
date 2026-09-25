# Permisos: flujos, diagramas y casos

Documento visual del modelo v2 (migraciones 0071→0077). Reglas y guía
operativa en `docs/PERMISOS.md`; aquí están los flujos completos y los casos.

## Índice

1. [Capas y ubicación de la lógica](#1-capas-y-ubicación-de-la-lógica)
2. [Modelo de datos](#2-modelo-de-datos)
3. [Visibilidad y niveles](#3-visibilidad-y-niveles)
4. [Decisión de permiso efectivo](#4-decisión-de-permiso-efectivo)
5. [Flujo de lectura (SELECT)](#5-flujo-de-lectura-select)
6. [Flujo de creación](#6-flujo-de-creación)
7. [Flujo de compartir](#7-flujo-de-compartir)
8. [Herencia: casos con árbol](#8-herencia-casos-con-árbol)
9. [Tipos de usuario](#9-tipos-de-usuario)
10. [Ciclo de vida de una entidad](#10-ciclo-de-vida-de-una-entidad)
11. [Agregar un tipo nuevo](#11-agregar-un-tipo-nuevo)
12. [Endpoints y tablas del contrato](#12-endpoints-y-tablas-del-contrato)
13. [Tests](#13-tests)
14. [Invariantes y anti-patrones](#14-invariantes-y-anti-patrones)

---

## 1. Capas y ubicación de la lógica

```mermaid
graph TB
  subgraph BD["PostgreSQL / Supabase (decide TODO)"]
    E[("entities<br/>jerarquía + visibilidad")]
    G[("entity_visibility<br/>grants")]
    F["funciones<br/>entity_effective / readable / writable / manageable"]
    P["policies RLS por tabla"]
    E --> F
    G --> F
    F --> P
  end

  subgraph API["apps/api (no replica permisos)"]
    MW["clienteUsuarioMiddleware<br/>setSession con JWT del usuario"]
    R["rutas /entidades /tareas /documentos ..."]
    MW --> R
  end

  SPA["apps/web (SPA)"]
  SH["packages/shared<br/>espeja reglas para UI"]

  SPA -->|"Bearer + refresh"| MW
  R -->|"consulta con auth.uid()"| P
  SPA -.->|"effectiveLevelOf / visibilityOf"| SH
```

La API nunca decide: envía el JWT del usuario y Supabase aplica RLS. El SPA
solo previsualiza con `packages/shared` (debe espejar la misma semántica).

## 2. Modelo de datos

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ ENTITIES : contiene
  ENTITY_TYPES ||--o{ ENTITIES : clasifica
  ENTITIES ||--o{ ENTITIES : "parent_id (jerarquía)"
  ENTITIES ||--o{ ENTITY_VISIBILITY : "grants (CASCADE)"
  PROFILES ||--o{ ENTITY_VISIBILITY : recibe
  ENTITY_TYPES ||--|| CONTENT_TABLE : "tabla de contenido"

  ENTITIES {
    uuid id PK
    text entity_type FK
    uuid organization_id FK
    uuid parent_id FK
    text visibility "public|restricted|private"
    text name
    int position
    uuid created_by FK
  }
  ENTITY_VISIBILITY {
    text entity_type
    uuid entity_id FK
    uuid profile_id FK
    text permission "read|write|manage"
    bool inherit
  }
  ENTITY_TYPES {
    text clave PK
    text tabla
    text parent_expr
  }
```

Registro actual de `entity_types`:

| clave        | tabla               | padre (`parent_expr`)                      |
| ------------ | ------------------- | ------------------------------------------ |
| `workspace`  | `workspaces`        | — (solo admin)                             |
| `folder`     | `workspace_folders` | `coalesce(parent_folder_id, workspace_id)` |
| `list`       | `task_lists`        | `coalesce(folder_id, workspace_id)`        |
| `document`   | `documents`         | `coalesce(folder_id, workspace_id)`        |
| `mindmap`    | `mind_maps`         | `coalesce(folder_id, workspace_id)`        |
| `todo`       | `todos`             | `coalesce(folder_id, workspace_id)`        |
| `formulario` | `formularios`       | `coalesce(folder_id, workspace_id)`        |

Tablas hijas (no están en `entity_types`, cuelgan de una entidad):

```mermaid
graph LR
  L[lista] --> T[tasks]
  T --> N[task_notes]
  T --> A[task_activity_log]
  D[documento] --> PG[document_pages]
  TD[to-do] --> TI[todo_items]
  F[formulario] --> FR[formulario_respuestas]
  F --> FL[formulario_listas]
  F --> FI[formulario_invitados]
```

## 3. Visibilidad y niveles

```mermaid
stateDiagram-v2
  [*] --> public: por defecto
  public --> restricted: solo asignados + herencia
  public --> private: solo grant directo / admin / creador
  restricted --> public
  private --> public
```

| Visibilidad  | Quién la ve                                           | Herencia de ancestros      |
| ------------ | ----------------------------------------------------- | -------------------------- |
| `public`     | Toda la organización (modo `org`) y quien tenga grant | Sí (capada a write)        |
| `restricted` | Personal asignado (grant directo) + herencia          | Sí (capada a write)        |
| `private`    | Solo grant directo, admin, creador                    | **No** (corta la herencia) |

| Nivel        | Puede                                                     |
| ------------ | --------------------------------------------------------- |
| `read` (1)   | Ver                                                       |
| `write` (2)  | Ver + crear dentro (si el contenedor es visible) + editar |
| `manage` (3) | Todo lo anterior + eliminar + compartir                   |

Regla de cap: cualquier permiso **heredado** se limita a `write`. Eliminar y
compartir exigen `manage` **directo** (o admin).

## 4. Decisión de permiso efectivo

```mermaid
flowchart TD
  A[Consultar entidad X] --> B{"¿X es de mi organización?"}
  B -- No --> Z["NULL (invisible)"]
  B -- Sí --> C{"¿Tengo grant directo<br/>sobre X?"}
  C -- Sí --> D["nivel completo<br/>read / write / manage"]
  C -- No --> E{"¿X es private?"}
  E -- Sí --> Z
  E -- No --> F["Recorrer ancestros<br/>con inherit=true"]
  F --> G{"¿Algún ancestro<br/>tiene grant?"}
  G -- No --> H{"¿Modo org y X public?"}
  H -- Sí --> I["read"]
  H -- No --> Z
  G -- Sí --> J["max(niveles) capado a write"]
```

Funciones que implementan esto:

| Función                         | Devuelve                                   |
| ------------------------------- | ------------------------------------------ |
| `entity_effective(id)`          | nivel efectivo o NULL (la de arriba)       |
| `entity_readable(id)`           | admin ∨ effective ≠ NULL ∨ (org ∧ public)  |
| `entity_writable(id)`           | admin ∨ rank(effective) ≥ 2                |
| `entity_manageable(id)`         | admin ∨ rank(effective) ≥ 3                |
| `entity_navigation_visible(id)` | readable(id) ∨ algún descendiente readable |

## 5. Flujo de lectura (SELECT)

```mermaid
sequenceDiagram
  participant SPA as SPA
  participant API as API (passthrough)
  participant RLS as RLS (BD)
  participant NAV as entity_navigation_visible

  SPA->>API: GET /entidades/arbol (Bearer)
  API->>RLS: SELECT ... con JWT del usuario
  RLS->>NAV: por cada fila
  NAV->>NAV: ¿readable? ¿algún descendiente readable?
  alt visible
    RLS-->>API: fila
  else no visible
    RLS-->>API: fila filtrada
  end
  API-->>SPA: árbol ya filtrado (sin lógica extra)
```

- Modo `org`: además de grants, ve todo lo `public` de su organización.
- Modo `grants_only`: solo grants (y los ancestros necesarios para navegar).
- Admin: todo lo de **su** organización (jamás otra).

## 6. Flujo de creación

```mermaid
sequenceDiagram
  participant SPA
  participant API
  participant DB as PostgreSQL

  SPA->>API: POST /entidades {tipo, padre, visibility}
  API->>DB: INSERT en tabla de contenido (JWT del usuario)
  DB->>DB: Policy INSERT: entity_writable(padre)
  alt sin write efectivo en el padre
    DB-->>API: 42501 RLS violation
    API-->>SPA: error
  else con write
    DB->>DB: BEFORE INSERT sync_entity_projection → entities
    DB->>DB: AFTER INSERT grant_creator_access → grant manage del creador
    DB-->>API: id
    API-->>SPA: 201 id
  end
  opt visibility = restricted con asignados
    SPA->>API: POST /entidades/:tipo/:id/grants
  end
```

Claves del flujo:

- El padre debe ser **visible y escribible**: se acabó crear dentro de algo
  que no se ve.
- El creador recibe `manage` directo automático → siempre ve lo que creó.
- Los grants del creador se omiten si `auth.uid()` es NULL (service role/seeds).
- El trigger de proyección es **BEFORE** para que `grant_creator_access`
  (AFTER) ya encuentre la fila en `entities`.

## 7. Flujo de compartir

```mermaid
sequenceDiagram
  participant UI as UI (colaboradores / compartir)
  participant API
  participant DB as PostgreSQL

  UI->>API: POST /entidades/:tipo/:id/grants o /colaboradores/grants
  API->>DB: INSERT/UPDATE entity_visibility
  DB->>DB: BEFORE: sync_grant_entity_type (tipo desde entities)
  DB->>DB: Policy ev_write: entity_manageable(id) y destino de la misma org
  alt sin manage
    DB-->>API: 42501
    API-->>UI: error
  else con manage o admin
    DB-->>UI: ok
  end
```

- `manage` puede compartir (antes solo admin).
- No se puede otorgar a perfiles de otra organización.
- El tipo del grant se deriva siempre de `entities` (no hay drift).
- Realtime: el SPA escucha `postgres_changes` de `entity_visibility` para
  refrescar accesos en vivo.

## 8. Herencia: casos con árbol

Árbol de ejemplo:

```mermaid
graph TD
  W["WS (public)<br/>grant write+inherit para Ana"] --> FP["F Pub (public)"]
  W --> FR["F Rest (restricted)"]
  W --> FPRI["F Priv (private)"]
  FP --> DP["Doc Pub (public)"]
  FP --> DPR["Doc Priv (private)"]
  FR --> DR["Doc En Rest (restricted)"]
```

| Consulta de Ana | ¿Directo?  | Target     | Resultado | Motivo                    |
| --------------- | ---------- | ---------- | --------- | ------------------------- |
| `WS`            | sí (write) | public     | `write`   | grant directo             |
| `FP`            | no         | public     | `write`   | herencia capada           |
| `DP`            | no         | public     | `write`   | herencia capada           |
| `FR`            | no         | restricted | `write`   | restringido **sí** hereda |
| `DR`            | no         | restricted | `write`   | restringido **sí** hereda |
| `FPRI`          | no         | private    | `NULL`    | privado corta herencia    |
| `DPR`           | no         | private    | `NULL`    | privado corta herencia    |
| cualquier cosa  | —          | —          | eliminar  | requiere `manage` directo |

Otros casos:

| Caso                                    | Configuración            | Resultado                                                  |
| --------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| Grant directo en hijo privado           | read en `DPR`            | visible (`read`)                                           |
| Grant en carpeta con subcarpeta privada | read en `FP`             | `FP`, `DP`, `DPR`? → `DPR` no (private), resto read capado |
| Grant manage heredado                   | manage en `WS`           | hijos heredan `write`, nunca borrar                        |
| Creador                                 | Ana creó `DPR` (private) | `manage` directo del trigger → lo ve                       |
| Sin grants, modo org                    | doc `public`             | `read`                                                     |
| Sin grants, modo grants_only            | doc `public`             | invisible                                                  |
| Grant en documento suelto               | read en `DP`             | Ana ve `DP` + `WS`/`FP` solo como navegación               |
| Otra organización                       | admin B                  | `NULL` en todo; INSERT/UPDATE/DELETE bloqueados            |

## 9. Tipos de usuario

```mermaid
flowchart LR
  U[Usuario] --> A{"¿Es admin?"}
  A -- Sí --> A1["Todo su organización<br/>(aislado por org)"]
  A -- No --> M{"access_mode"}
  M -- org --> O1["public de la org +<br/>sus grants (directos/heredados)"]
  M -- grants_only --> O2["solo sus grants +<br/>ancestros de navegación"]
```

| Comportamiento          | admin      | colaborador `org`            | invitado `grants_only`       |
| ----------------------- | ---------- | ---------------------------- | ---------------------------- |
| Docs `public` sin grant | ve         | ve                           | no ve                        |
| Contenido con grant     | ve         | ve                           | ve                           |
| Navegación de ancestros | n/a        | no aplica                    | sí (solo ruta)               |
| Crear                   | todo (org) | con `write` en el contenedor | con `write` en el contenedor |
| Compartir               | sí         | solo con `manage`            | solo con `manage`            |

## 10. Ciclo de vida de una entidad

```mermaid
sequenceDiagram
  participant App as API/UI
  participant CT as Tabla de contenido
  participant EN as entities
  participant EV as entity_visibility

  App->>CT: INSERT
  CT->>EN: BEFORE trg_*_entity_sync (upsert proyección)
  CT->>EV: AFTER trg_*_creator_access (manage del creador)
  App->>CT: UPDATE (nombre, visibilidad, mover)
  CT->>EN: BEFORE sync (actualiza visibility/name/parent)
  Note over CT,EN: mover = cambiar folder_id/workspace_id/parent_folder_id
  App->>CT: DELETE
  CT->>EN: BEFORE sync (borra la fila)
  EN->>EV: ON DELETE CASCADE (borra grants)
```

- Los UUID son **los mismos** en la tabla de contenido y en `entities`.
- Si el contenedor se borra y un hijo sobrevive (FK `SET NULL`), el trigger de
  sync reubica la proyección (el hijo sube de nivel).
- `mover` se recalcula por la expresión de padre del tipo (`parent_expr`).
- Hay triggers legacy `trg_ev_*` de limpieza de grants; el FK `CASCADE` ya lo
  cubre (se mantienen sin daño).

## 11. Agregar un tipo nuevo

```mermaid
flowchart TD
  T1["1. Crear tabla de contenido<br/>(id, org, workspace, folder, name, visibility, position)"] --> T2
  T2["2. INSERT INTO entity_types<br/>(clave, tabla, parent_expr)"] --> T3
  T3["3. Trigger BEFORE sync_entity_projection('clave')"] --> T4
  T4["4. Trigger AFTER grant_creator_access('clave')"] --> T5
  T5["5. SELECT rebuild_entity_policies()"] --> T6
  T6["6. shared EntityType + API TIPO_ENTIDAD + UI"] --> T7
  T7["7. Agregar casos a supabase/tests/permisos_matriz.sql"]
```

Con esto el tipo queda cubierto por: ver / crear / editar / borrar / compartir /
navegación / aislamiento por organización, sin tocar funciones ni policies a
mano.

## 12. Endpoints y tablas del contrato

| Endpoint                           | Uso                       | Permiso exigido por RLS |
| ---------------------------------- | ------------------------- | ----------------------- |
| `GET /entidades/arbol`             | árbol completo            | visibilidad por fila    |
| `GET /entidades/permiso?type&id`   | nivel efectivo            | lectura de la entidad   |
| `GET /entidades/grants?profile_id` | grants de un perfil       | propio grant o admin    |
| `POST /entidades`                  | crear                     | write en el contenedor  |
| `PATCH /entidades/:type/:id`       | editar/nombre/visibilidad | write                   |
| `POST /entidades/:type/:id/mover`  | cambiar de padre          | write                   |
| `POST /entidades/:type/:id/clonar` | clonar + copiar grants    | write                   |
| `POST /entidades/reordenar`        | posición batch            | write por fila          |
| `DELETE /entidades/:type/:id`      | eliminar                  | manage                  |
| `POST /entidades/:type/:id/grants` | compartir                 | manage                  |
| `POST /colaboradores/grants`       | otorgar acceso            | manage                  |
| `DELETE /colaboradores/grants`     | quitar acceso             | manage                  |

## 13. Tests

```mermaid
flowchart LR
  A["npm run test:rls<br/>(supabase start + supabase test db)"] --> B["supabase/tests/permisos_matriz.sql"]
  B --> C["Fixture: 2 orgs, 5 usuarios,<br/>árbol con 3 visibilidades"]
  C --> D["Bloque colaborador org"]
  C --> E["Bloque manage comparte"]
  C --> F["Bloque grants_only navega"]
  C --> G["Bloque admin de otra org"]
  D & E & F & G --> H{"¿RAISE?"}
  H -- Sí --> I["Falló: mensaje con el caso"]
  H -- No --> J["MATRIZ OK + ROLLBACK"]
```

## 14. Invariantes y anti-patrones

Invariantes (no romper nunca):

1. Toda decisión de permiso vive en la BD; API y SPA no la replican.
2. Herencia: capada a write; solo `private` la corta.
3. Crear exige `write` efectivo de un contenedor visible.
4. Eliminar/compartir exigen `manage` (o admin).
5. Toda rama admin lleva `organization_id = get_my_org_id()`.
6. El trigger de proyección (`entities`) es BEFORE; el de creador, AFTER.
7. Grants y entidades comparten UUID; el tipo del grant se deriva de `entities`.

Anti-patrones:

- Añadir un tipo sin fila en `entity_types` / sin `rebuild_entity_policies()`.
- Consultar `entities` dentro de una policy (RLS sin policies → siempre falso):
  usar los helpers `entity_*` (son `SECURITY DEFINER`).
- Poner lógica de permisos en la API o en el SPA "para ir más rápido".
- Volver a propagar grants a mano (el workaround viejo ya no es necesario:
  la herencia cubre el caso).
- Duplicar la resolución de padre en SQL/TS: usar `entity_types` y
  `visibilityOf`/`effectiveLevelOf`.
