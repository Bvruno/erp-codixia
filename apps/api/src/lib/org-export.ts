import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;
const IN_CHUNK = 900;

export interface OrgExport {
  organization_id: string;
  exported_at: string;
  tables: Record<string, unknown[]>;
}

type ExportStrategy =
  | { kind: "direct"; column: string }
  | { kind: "child"; column: string; parent: string }
  | { kind: "profiles"; column: string };

interface ExportTableDef {
  key: string;
  table: string;
  strategy: ExportStrategy;
}

const EXPORT_TABLES: ExportTableDef[] = [
  { key: "organizations", table: "organizations", strategy: { kind: "direct", column: "id" } },
  { key: "profiles", table: "profiles", strategy: { kind: "direct", column: "organization_id" } },
  { key: "shifts", table: "shifts", strategy: { kind: "direct", column: "organization_id" } },
  { key: "org_settings", table: "org_settings", strategy: { kind: "direct", column: "organization_id" } },
  { key: "telegram_config", table: "telegram_config", strategy: { kind: "direct", column: "organization_id" } },
  { key: "schedules", table: "schedules", strategy: { kind: "direct", column: "organization_id" } },
  { key: "invitations", table: "invitations", strategy: { kind: "direct", column: "organization_id" } },
  { key: "tasks", table: "tasks", strategy: { kind: "direct", column: "organization_id" } },
  { key: "task_notes", table: "task_notes", strategy: { kind: "child", column: "task_id", parent: "tasks" } },
  {
    key: "task_activity_log",
    table: "task_activity_log",
    strategy: { kind: "child", column: "task_id", parent: "tasks" },
  },
  { key: "task_lists", table: "task_lists", strategy: { kind: "direct", column: "organization_id" } },
  { key: "workspaces", table: "workspaces", strategy: { kind: "direct", column: "organization_id" } },
  {
    key: "workspace_folders",
    table: "workspace_folders",
    strategy: { kind: "child", column: "workspace_id", parent: "workspaces" },
  },
  { key: "documents", table: "documents", strategy: { kind: "direct", column: "organization_id" } },
  {
    key: "document_pages",
    table: "document_pages",
    strategy: { kind: "child", column: "document_id", parent: "documents" },
  },
  { key: "mind_maps", table: "mind_maps", strategy: { kind: "direct", column: "organization_id" } },
  { key: "notes", table: "notes", strategy: { kind: "direct", column: "organization_id" } },
  { key: "time_entries", table: "time_entries", strategy: { kind: "direct", column: "organization_id" } },
  { key: "permissions", table: "permissions", strategy: { kind: "direct", column: "organization_id" } },
  { key: "notifications", table: "notifications", strategy: { kind: "profiles", column: "user_id" } },
  {
    key: "entity_visibility",
    table: "entity_visibility",
    strategy: { kind: "profiles", column: "profile_id" },
  },
  { key: "todos", table: "todos", strategy: { kind: "direct", column: "organization_id" } },
  { key: "todo_items", table: "todo_items", strategy: { kind: "child", column: "todo_id", parent: "todos" } },
  {
    key: "todo_progress",
    table: "todo_progress",
    strategy: { kind: "child", column: "template_id", parent: "todo_items" },
  },
  {
    key: "formularios",
    table: "formularios",
    strategy: { kind: "direct", column: "organization_id" },
  },
  {
    key: "formulario_respuestas",
    table: "formulario_respuestas",
    strategy: { kind: "child", column: "formulario_id", parent: "formularios" },
  },
  {
    key: "formulario_listas",
    table: "formulario_listas",
    strategy: { kind: "child", column: "formulario_id", parent: "formularios" },
  },
  {
    key: "formulario_invitados",
    table: "formulario_invitados",
    strategy: { kind: "child", column: "formulario_id", parent: "formularios" },
  },
  { key: "audit_logs", table: "audit_logs", strategy: { kind: "direct", column: "organization_id" } },
];

export interface TableQuery {
  select(columns: string): TableQuery;
  range(from: number, to: number): TableQuery;
  eq(column: string, value: unknown): TableQuery;
  in(column: string, values: unknown[]): TableQuery;
  then<TResult1 = { data: unknown[] | null; error: { message: string } | null }>(
    onfulfilled?:
      | ((
          value: { data: unknown[] | null; error: { message: string } | null },
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
  ): PromiseLike<TResult1>;
}

async function fetchAll(
  admin: SupabaseClient,
  table: string,
  filter?: (query: TableQuery) => TableQuery,
): Promise<unknown[]> {
  const rows: unknown[] = [];
  let from = 0;
  for (;;) {
    let query = admin
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1) as unknown as TableQuery;
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) {
      throw new Error(`No se pudo exportar ${table}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchByIds(
  admin: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
): Promise<unknown[]> {
  if (ids.length === 0) return [];
  const rows: unknown[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    rows.push(...(await fetchAll(admin, table, (query) => query.in(column, chunk))));
  }
  return rows;
}

export async function collectOrgExport(
  admin: SupabaseClient,
  organizationId: string,
): Promise<OrgExport> {
  const tables: Record<string, unknown[]> = {};

  for (const def of EXPORT_TABLES) {
    const { strategy } = def;
    if (strategy.kind === "direct") {
      tables[def.key] = await fetchAll(admin, def.table, (query) =>
        query.eq(strategy.column, organizationId),
      );
    } else if (strategy.kind === "child") {
      const parentIds = (tables[strategy.parent] ?? [])
        .map((row) => (row as { id?: string }).id)
        .filter((id): id is string => Boolean(id));
      tables[def.key] = await fetchByIds(admin, def.table, strategy.column, parentIds);
    } else {
      const profileIds = (tables.profiles ?? [])
        .map((row) => (row as { id?: string }).id)
        .filter((id): id is string => Boolean(id));
      tables[def.key] = await fetchByIds(admin, def.table, strategy.column, profileIds);
    }
  }

  return {
    organization_id: organizationId,
    exported_at: new Date().toISOString(),
    tables,
  };
}

export function tableColumns(rows: unknown[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

export function jsonCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export function exportFileName(
  orgName: string | null | undefined,
  format: "json" | "xlsx",
  date = new Date(),
): string {
  const slug =
    (orgName ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org";
  const day = date.toISOString().slice(0, 10);
  return `org-${slug}-${day}.${format}`;
}