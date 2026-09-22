import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectOrgExport,
  exportFileName,
  jsonCell,
  tableColumns,
  type TableQuery,
} from "@/lib/org-export";

interface FakeRow {
  id?: string;
  organization_id?: string;
  task_id?: string;
  user_id?: string;
  profile_id?: string;
  [key: string]: unknown;
}

function fakeAdmin(tables: Record<string, FakeRow[]>): SupabaseClient {
  const from = (table: string) => {
    const data = tables[table] ?? [];
    let match: (row: FakeRow) => boolean = () => true;
    let rangeFrom = 0;
    let rangeTo = Number.MAX_SAFE_INTEGER;
    const query: TableQuery = {
      select: () => query,
      range: (from: number, to: number) => {
        rangeFrom = from;
        rangeTo = to;
        return query;
      },
      eq: (column: string, value: unknown) => {
        match = (row: FakeRow) => row[column] === value;
        return query;
      },
      in: (column: string, values: unknown[]) => {
        match = (row: FakeRow) => values.includes(row[column]);
        return query;
      },
      then: (resolve) => {
        const page = data.filter(match).slice(rangeFrom, rangeTo + 1);
        resolve?.({ data: page, error: null });
        return undefined as never;
      },
    };
    return query;
  };
  return { from } as unknown as SupabaseClient;
}

const ORG_ID = "org-1";

function baseData(): Record<string, FakeRow[]> {
  return {
    organizations: [{ id: ORG_ID, name: "Acme" }],
    profiles: [
      { id: "p-1", organization_id: ORG_ID },
      { id: "p-2", organization_id: ORG_ID },
      { id: "p-3", organization_id: "other" },
    ],
    tasks: [{ id: "t-1", organization_id: ORG_ID }],
    task_notes: [
      { id: "n-1", task_id: "t-1" },
      { id: "n-2", task_id: "t-999" },
    ],
    workspaces: [{ id: "w-1", organization_id: ORG_ID }],
    workspace_folders: [
      { id: "f-1", workspace_id: "w-1" },
      { id: "f-2", workspace_id: "w-999" },
    ],
    notifications: [
      { id: "nt-1", user_id: "p-1" },
      { id: "nt-2", user_id: "p-3" },
    ],
    entity_visibility: [
      { entity_id: "e-1", profile_id: "p-2" },
      { entity_id: "e-2", profile_id: "p-3" },
    ],
  };
}

describe("collectOrgExport", () => {
  it("exporta tablas directas filtradas por organización", async () => {
    const dump = await collectOrgExport(fakeAdmin(baseData()), ORG_ID);

    expect(dump.organization_id).toBe(ORG_ID);
    expect(dump.tables.organizations).toEqual([{ id: ORG_ID, name: "Acme" }]);
    expect(dump.tables.profiles).toEqual([
      { id: "p-1", organization_id: ORG_ID },
      { id: "p-2", organization_id: ORG_ID },
    ]);
    expect(dump.tables.tasks).toEqual([{ id: "t-1", organization_id: ORG_ID }]);
  });

  it("exporta tablas hijas solo con padres de la organización", async () => {
    const dump = await collectOrgExport(fakeAdmin(baseData()), ORG_ID);

    expect(dump.tables.task_notes).toEqual([{ id: "n-1", task_id: "t-1" }]);
    expect(dump.tables.workspace_folders).toEqual([{ id: "f-1", workspace_id: "w-1" }]);
  });

  it("exporta tablas vinculadas a perfiles solo con perfiles de la organización", async () => {
    const dump = await collectOrgExport(fakeAdmin(baseData()), ORG_ID);

    expect(dump.tables.notifications).toEqual([{ id: "nt-1", user_id: "p-1" }]);
    expect(dump.tables.entity_visibility).toEqual([{ entity_id: "e-1", profile_id: "p-2" }]);
  });

  it("devuelve tablas hijas vacías cuando no hay padres", async () => {
    const data = baseData();
    delete data.tasks;
    const dump = await collectOrgExport(fakeAdmin(data), ORG_ID);

    expect(dump.tables.task_notes).toEqual([]);
    expect(dump.tables.todo_items).toEqual([]);
    expect(dump.tables.todo_progress).toEqual([]);
  });

  it("pagina resultados de más de 1000 filas", async () => {
    const tasks = Array.from({ length: 1001 }, (_, i) => ({
      id: `t-${i}`,
      organization_id: ORG_ID,
    }));
    const dump = await collectOrgExport(fakeAdmin({ tasks }), ORG_ID);

    expect(dump.tables.tasks).toHaveLength(1001);
  });

  it("incluye todas las tablas definidas aunque estén vacías", async () => {
    const dump = await collectOrgExport(fakeAdmin({ organizations: [{ id: ORG_ID }] }), ORG_ID);

    expect(Object.keys(dump.tables).sort()).toEqual(
      [
        "audit_logs",
        "documents",
        "document_pages",
        "entity_visibility",
        "formulario_invitados",
        "formulario_listas",
        "formulario_respuestas",
        "formularios",
        "invitations",
        "mind_maps",
        "notes",
        "notifications",
        "org_settings",
        "organizations",
        "permissions",
        "profiles",
        "schedules",
        "shifts",
        "task_activity_log",
        "task_lists",
        "task_notes",
        "tasks",
        "telegram_config",
        "time_entries",
        "todo_items",
        "todo_progress",
        "todos",
        "workspace_folders",
        "workspaces",
      ].sort(),
    );
  });
});

describe("tableColumns", () => {
  it("une columnas de todas las filas preservando orden de aparición", () => {
    expect(tableColumns([{ a: 1, b: 2 }, { c: 3, a: 4 }])).toEqual(["a", "b", "c"]);
  });

  it("devuelve array vacío sin filas", () => {
    expect(tableColumns([])).toEqual([]);
  });
});

describe("jsonCell", () => {
  it("convierte null y undefined a null", () => {
    expect(jsonCell(null)).toBeNull();
    expect(jsonCell(undefined)).toBeNull();
  });

  it("serializa objetos a JSON", () => {
    expect(jsonCell({ a: [1, 2] })).toBe('{"a":[1,2]}');
    expect(jsonCell([1, 2])).toBe("[1,2]");
  });

  it("deja primitivos intactos", () => {
    expect(jsonCell("hola")).toBe("hola");
    expect(jsonCell(42)).toBe(42);
    expect(jsonCell(true)).toBe(true);
  });
});

describe("exportFileName", () => {
  it("genera slug con fecha", () => {
    const date = new Date("2026-09-12T10:00:00Z");
    expect(exportFileName("ERP Codixia S.A.", "xlsx", date)).toBe(
      "org-erp-codixia-s-a-2026-09-12.xlsx",
    );
  });

  it("quita acentos", () => {
    const date = new Date("2026-09-12T10:00:00Z");
    expect(exportFileName("Organización Ágil", "json", date)).toBe(
      "org-organizacion-agil-2026-09-12.json",
    );
  });

  it("usa org como fallback sin nombre", () => {
    const date = new Date("2026-09-12T10:00:00Z");
    expect(exportFileName(null, "json", date)).toBe("org-org-2026-09-12.json");
  });
});