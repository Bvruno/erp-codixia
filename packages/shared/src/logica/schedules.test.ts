import { describe, it, expect } from "vitest";
import type { Schedule } from "@/types";
import {
  hasSchedule,
  daysWithSchedule,
  shiftDurationHours,
  weeklyHoursFromSchedules,
  scheduleConflictsWith,
} from "./schedules";

function sched(
  overrides: Partial<Schedule> & { shift_id: string },
): Schedule {
  return {
    id: overrides.id ?? "s1",
    organization_id: "org1",
    user_id: "u1",
    day_of_week: 1,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    shift: null,
    ...overrides,
  };
}

const schedules: Schedule[] = [
  sched({
    shift_id: "mañana",
    day_of_week: 1,
    shift: { id: "mañana", name: "Mañana", start_time: "08:00", end_time: "14:00", color: "#3b82f6", crosses_midnight: false, break_start_time: null, break_end_time: null, created_at: "", organization_id: "org1" },
  }),
  sched({
    shift_id: "noche",
    day_of_week: 5,
    shift: { id: "noche", name: "Noche", start_time: "20:00", end_time: "02:00", color: "#3b82f6", crosses_midnight: true, break_start_time: null, break_end_time: null, created_at: "", organization_id: "org1" },
  }),
];

describe("hasSchedule", () => {
  it("true si el usuario tiene al menos un turno", () => {
    expect(hasSchedule(schedules, "u1")).toBe(true);
    expect(hasSchedule(schedules, "u2")).toBe(false);
  });
});

describe("daysWithSchedule", () => {
  it("devuelve los días ordenados", () => {
    expect(daysWithSchedule(schedules, "u1")).toEqual([1, 5]);
  });
});

describe("shiftDurationHours", () => {
  it("turno normal", () => {
    expect(shiftDurationHours({ start_time: "08:00", end_time: "14:00" })).toBe(6);
  });
  it("turno nocturno cruza medianoche", () => {
    expect(shiftDurationHours({ start_time: "20:00", end_time: "02:00" })).toBe(6);
  });
  it("hasta medianoche", () => {
    expect(shiftDurationHours({ start_time: "22:00", end_time: "00:00" })).toBe(2);
  });
  it("resta el descanso", () => {
    expect(
      shiftDurationHours({
        start_time: "08:00",
        end_time: "14:00",
        break_start_time: "12:00",
        break_end_time: "13:00",
      }),
    ).toBe(5);
  });
  it("resta el descanso en turno nocturno", () => {
    expect(
      shiftDurationHours({
        start_time: "20:00",
        end_time: "02:00",
        break_start_time: "23:00",
        break_end_time: "00:00",
      }),
    ).toBe(5);
  });
});

describe("weeklyHoursFromSchedules", () => {
  it("suma duración de turnos por día", () => {
    expect(weeklyHoursFromSchedules(schedules, "u1")).toBe(12);
  });
});

describe("scheduleConflictsWith", () => {
  it("detecta choque con turno del mismo día", () => {
    const hit = scheduleConflictsWith(schedules, "u1", 1, {
      start_time: "10:00",
      end_time: "12:00",
    });
    expect(hit?.name).toBe("Mañana");
  });
  it("no choca en otro día", () => {
    expect(scheduleConflictsWith(schedules, "u1", 2, { start_time: "10:00", end_time: "12:00" })).toBeNull();
  });
  it("no choca si no se solapa", () => {
    expect(scheduleConflictsWith(schedules, "u1", 1, { start_time: "15:00", end_time: "18:00" })).toBeNull();
  });
  it("detecta choque nocturno", () => {
    const hit = scheduleConflictsWith(schedules, "u1", 5, {
      start_time: "23:00",
      end_time: "01:00",
    });
    expect(hit?.name).toBe("Noche");
  });
  it("mock schedule sin shift no cuenta", () => {
    const noShift = [sched({ shift_id: "x", shift: null })];
    expect(scheduleConflictsWith(noShift, "u1", 1, { start_time: "10:00", end_time: "12:00" })).toBeNull();
  });
});