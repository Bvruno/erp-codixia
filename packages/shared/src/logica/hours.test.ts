import { describe, it, expect } from "vitest";
import {
  computeHours,
  dayHours,
  inRange,
  sumByType,
  type HoursEntry,
  type PermissionRow,
} from "./hours";

const START = new Date("2026-08-03T00:00:00"); // lunes
const END = new Date("2026-08-09T00:00:00"); // domingo

function entry(
  overrides: Partial<HoursEntry> & {
    user_id: string;
    date: string;
    hours: number;
  },
): HoursEntry {
  return { type: "worked", ...overrides };
}

function perm(
  overrides: Partial<PermissionRow> & { user_id: string; date: string },
): PermissionRow {
  return {
    estimated_hours: 4,
    makeup_date: null,
    status: "approved",
    ...overrides,
  };
}

describe("inRange", () => {
  it("incluye los bordes del rango", () => {
    expect(inRange("2026-08-03", START, END)).toBe(true);
    expect(inRange("2026-08-09", START, END)).toBe(true);
  });
  it("excluye fuera de rango", () => {
    expect(inRange("2026-08-02", START, END)).toBe(false);
    expect(inRange("2026-08-10", START, END)).toBe(false);
  });
});

describe("sumByType", () => {
  it("suma solo el tipo pedido", () => {
    const entries = [
      entry({ user_id: "u1", date: "2026-08-04", hours: 8 }),
      entry({ user_id: "u1", date: "2026-08-05", hours: 2, type: "overtime" }),
      entry({ user_id: "u2", date: "2026-08-04", hours: 9 }),
    ];
    expect(sumByType(entries, "u1", "worked", START, END)).toBe(8);
    expect(sumByType(entries, "u1", "overtime", START, END)).toBe(2);
  });
});

describe("dayHours", () => {
  it("suma todas las entradas de la fecha exacta", () => {
    const entries = [
      entry({ user_id: "u1", date: "2026-08-04", hours: 8 }),
      entry({ user_id: "u1", date: "2026-08-04", hours: 2, type: "overtime" }),
      entry({ user_id: "u2", date: "2026-08-04", hours: 6 }),
      entry({ user_id: "u1", date: "2026-08-05", hours: 9 }),
    ];
    expect(dayHours(entries, "2026-08-04")).toBe(16);
    expect(dayHours(entries, "2026-08-05")).toBe(9);
    expect(dayHours(entries, "2026-08-06")).toBe(0);
  });
});

describe("computeHours", () => {
  it("deuda básica = target - trabajado", () => {
    const r = computeHours({
      entries: [entry({ user_id: "u1", date: "2026-08-04", hours: 6 })],
      permissions: [],
      userId: "u1",
      start: START,
      end: END,
      target: 40,
    });
    expect(r.worked).toBe(6);
    expect(r.owed).toBe(34);
  });

  it("no baja de cero", () => {
    const r = computeHours({
      entries: [entry({ user_id: "u1", date: "2026-08-04", hours: 45 })],
      permissions: [],
      userId: "u1",
      start: START,
      end: END,
      target: 40,
    });
    expect(r.owed).toBe(0);
  });

  it("permiso aprobado sin recuperación exime la deuda", () => {
    const r = computeHours({
      entries: [entry({ user_id: "u1", date: "2026-08-04", hours: 36 })],
      permissions: [
        perm({ user_id: "u1", date: "2026-08-05", estimated_hours: 4 }),
      ],
      userId: "u1",
      start: START,
      end: END,
      target: 40,
    });
    expect(r.exempt).toBe(4);
    expect(r.owed).toBe(0);
    expect(r.pendingMakeup).toBe(false);
  });

  it("permiso con recuperación pendiente no exime y marca pendiente", () => {
    const r = computeHours({
      entries: [entry({ user_id: "u1", date: "2026-08-04", hours: 36 })],
      permissions: [
        perm({
          user_id: "u1",
          date: "2026-08-05",
          estimated_hours: 4,
          makeup_date: "2026-08-15",
        }),
      ],
      userId: "u1",
      start: START,
      end: END,
      target: 40,
    });
    expect(r.exempt).toBe(0);
    expect(r.pendingMakeup).toBe(true);
    expect(r.pendingMakeupHours).toBe(4);
    expect(r.owed).toBe(4);
  });

  it("permiso con recuperación registrada exime", () => {
    const r = computeHours({
      entries: [
        entry({ user_id: "u1", date: "2026-08-04", hours: 36 }),
        entry({ user_id: "u1", date: "2026-08-15", hours: 4, type: "makeup" }),
      ],
      permissions: [
        perm({
          user_id: "u1",
          date: "2026-08-05",
          estimated_hours: 4,
          makeup_date: "2026-08-15",
        }),
      ],
      userId: "u1",
      start: START,
      end: END,
      target: 40,
    });
    expect(r.exempt).toBe(4);
    expect(r.owed).toBe(0);
    expect(r.pendingMakeup).toBe(false);
  });

  it("permiso pendiente o rechazado no afecta", () => {
    const r = computeHours({
      entries: [],
      permissions: [
        perm({ user_id: "u1", date: "2026-08-05", status: "pending" }),
        perm({ user_id: "u1", date: "2026-08-06", status: "rejected" }),
      ],
      userId: "u1",
      start: START,
      end: END,
      target: 40,
    });
    expect(r.exempt).toBe(0);
    expect(r.owed).toBe(40);
  });

  it("separación de extras y recuperación", () => {
    const r = computeHours({
      entries: [
        entry({ user_id: "u1", date: "2026-08-04", hours: 8 }),
        entry({
          user_id: "u1",
          date: "2026-08-05",
          hours: 2,
          type: "overtime",
        }),
        entry({ user_id: "u1", date: "2026-08-06", hours: 3, type: "makeup" }),
      ],
      permissions: [],
      userId: "u1",
      start: START,
      end: END,
      target: 40,
    });
    expect(r.worked).toBe(8);
    expect(r.overtime).toBe(2);
    expect(r.makeup).toBe(3);
  });
});
