import { describe, it, expect } from "vitest";
import {
  breakDurationMinutes,
  breakWithinShift,
  DEFAULT_SHIFT_COLOR,
  generateTimeSlots,
  hasBreak,
  isOvernightShift,
  minutesOf,
  segmentsOverlap,
  shiftCardStyle,
  shiftDaySegments,
  shiftSegments,
  type ShiftLike,
} from "./shift-utils";

function shift(
  overrides: Partial<ShiftLike> & { start_time: string; end_time: string },
): ShiftLike {
  return { crosses_midnight: false, ...overrides };
}

describe("minutesOf", () => {
  it("convierte HH:MM:SS y HH:MM", () => {
    expect(minutesOf("08:30:00")).toBe(510);
    expect(minutesOf("14:00")).toBe(840);
  });
  it("devuelve -1 para vacío o inválido", () => {
    expect(minutesOf(null)).toBe(-1);
    expect(minutesOf("abc")).toBe(-1);
  });
});

describe("hasBreak", () => {
  it("true solo si hay inicio y fin distintos", () => {
    expect(hasBreak(shift({ start_time: "08:00", end_time: "14:00" }))).toBe(false);
    expect(
      hasBreak(
        shift({
          start_time: "08:00",
          end_time: "14:00",
          break_start_time: "12:00",
        }),
      ),
    ).toBe(false);
    expect(
      hasBreak(
        shift({
          start_time: "08:00",
          end_time: "14:00",
          break_start_time: "12:00",
          break_end_time: "12:00",
        }),
      ),
    ).toBe(false);
    expect(
      hasBreak(
        shift({
          start_time: "08:00",
          end_time: "14:00",
          break_start_time: "12:00",
          break_end_time: "13:00",
        }),
      ),
    ).toBe(true);
  });
});

describe("breakDurationMinutes", () => {
  it("devuelve 0 sin descanso", () => {
    expect(breakDurationMinutes(shift({ start_time: "08:00", end_time: "14:00" }))).toBe(0);
  });
  it("descanso dentro del día", () => {
    expect(
      breakDurationMinutes(
        shift({
          start_time: "08:00",
          end_time: "14:00",
          break_start_time: "12:00",
          break_end_time: "13:00",
        }),
      ),
    ).toBe(60);
  });
  it("descanso que cruza medianoche", () => {
    expect(
      breakDurationMinutes(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          break_start_time: "23:30",
          break_end_time: "00:30",
        }),
      ),
    ).toBe(60);
  });
});

describe("breakWithinShift", () => {
  it("true si el descanso cae dentro del turno", () => {
    expect(
      breakWithinShift(
        shift({
          start_time: "08:00",
          end_time: "14:00",
          break_start_time: "12:00",
          break_end_time: "13:00",
        }),
      ),
    ).toBe(true);
  });
  it("false si el descanso sale del turno", () => {
    expect(
      breakWithinShift(
        shift({
          start_time: "08:00",
          end_time: "14:00",
          break_start_time: "15:00",
          break_end_time: "16:00",
        }),
      ),
    ).toBe(false);
  });
  it("turno nocturno: descanso cruzando medianoche válido", () => {
    expect(
      breakWithinShift(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          crosses_midnight: true,
          break_start_time: "23:30",
          break_end_time: "00:30",
        }),
      ),
    ).toBe(true);
  });
  it("false si el descanso dura más que el turno", () => {
    expect(
      breakWithinShift(
        shift({
          start_time: "08:00",
          end_time: "10:00",
          break_start_time: "08:00",
          break_end_time: "10:30",
        }),
      ),
    ).toBe(false);
  });
});

describe("isOvernightShift", () => {
    it("usa la columna crosses_midnight si existe", () => {
    expect(
      isOvernightShift(
        shift({
          start_time: "08:00",
          end_time: "14:00",
          crosses_midnight: true,
        }),
      ),
    ).toBe(true);
    expect(
      isOvernightShift(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          crosses_midnight: false,
        }),
      ),
    ).toBe(false);
  });
  it("infiere por horas cuando no existe", () => {
    expect(
      isOvernightShift(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          crosses_midnight: undefined,
        }),
      ),
    ).toBe(true);
    expect(
      isOvernightShift(
        shift({
          start_time: "08:00",
          end_time: "14:00",
          crosses_midnight: undefined,
        }),
      ),
    ).toBe(false);
    expect(
      isOvernightShift(
        shift({
          start_time: "14:00",
          end_time: "14:00",
          crosses_midnight: undefined,
        }),
      ),
    ).toBe(true);
  });
});

describe("shiftSegments", () => {
  it("turno diurno = un segmento", () => {
    expect(
      shiftSegments(shift({ start_time: "08:00", end_time: "14:00" })),
    ).toEqual([[480, 840]]);
  });
  it("nocturno = dos segmentos", () => {
    expect(
      shiftSegments(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          crosses_midnight: true,
        }),
      ),
    ).toEqual([
      [1200, 1440],
      [0, 120],
    ]);
  });
  it("fin exacto a medianoche = solo segmento de la tarde", () => {
    expect(
      shiftSegments(shift({ start_time: "20:00", end_time: "00:00" })),
    ).toEqual([[1200, 1440]]);
  });
  it("horas inválidas = sin segmentos", () => {
    expect(shiftSegments(shift({ start_time: "", end_time: "02:00" }))).toEqual(
      [],
    );
  });
});

describe("shiftDaySegments", () => {
  it("diurno = un segmento", () => {
    expect(
      shiftDaySegments(shift({ start_time: "08:00", end_time: "14:00" })),
    ).toEqual([[480, 840]]);
  });
  it("nocturno extiende la jornada tras 24:00", () => {
    expect(
      shiftDaySegments(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          crosses_midnight: true,
        }),
      ),
    ).toEqual([
      [1200, 1440],
      [1440, 1560],
    ]);
  });
});

describe("generateTimeSlots", () => {
  it("sin turnos = día completo de 30 min", () => {
    expect(generateTimeSlots([])).toHaveLength(48);
    expect(generateTimeSlots([])[0]).toBe("00:00");
  });
  it("respeto el override de inicio", () => {
    const slots = generateTimeSlots([], 9);
    expect(slots[0]).toBe("09:00");
    expect(slots).toHaveLength(30);
  });
  it("turno diurno acota el rango e inicia desde el turno más temprano", () => {
    const slots = generateTimeSlots([
      shift({ start_time: "08:00", end_time: "14:00" }),
      shift({ start_time: "14:00", end_time: "20:00" }),
    ]);
    expect(slots[0]).toBe("08:00");
    expect(slots[slots.length - 1]).toBe("19:30");
  });
  it("turno nocturno extiende la jornada tras medianoche", () => {
    const slots = generateTimeSlots([
      shift({ start_time: "08:00", end_time: "14:00" }),
      shift({ start_time: "20:00", end_time: "02:00", crosses_midnight: true }),
    ]);
    expect(slots[0]).toBe("08:00");
    expect(slots[slots.length - 1]).toBe("25:30");
  });
  it("turno nocturno solo arranca en su inicio", () => {
    const slots = generateTimeSlots([
      shift({ start_time: "20:00", end_time: "02:00", crosses_midnight: true }),
    ]);
    expect(slots[0]).toBe("20:00");
    expect(slots[slots.length - 1]).toBe("25:30");
  });
  it("turnos con :30 alinean límites exactos", () => {
    const slots = generateTimeSlots([
      shift({ start_time: "08:30", end_time: "14:30" }),
    ]);
    expect(slots[0]).toBe("08:30");
    expect(slots[slots.length - 1]).toBe("14:00");
    expect(slots).toHaveLength(12);
  });
});

describe("segmentsOverlap", () => {
  it("turnos contiguos no se solapan", () => {
    expect(
      segmentsOverlap(
        shift({ start_time: "08:00", end_time: "14:00" }),
        shift({ start_time: "14:00", end_time: "20:00" }),
      ),
    ).toBe(false);
  });
  it("turnos superpuestos sí", () => {
    expect(
      segmentsOverlap(
        shift({ start_time: "08:00", end_time: "14:00" }),
        shift({ start_time: "13:00", end_time: "17:00" }),
      ),
    ).toBe(true);
  });
  it("nocturno vs diurno sin cruce", () => {
    expect(
      segmentsOverlap(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          crosses_midnight: true,
        }),
        shift({ start_time: "08:00", end_time: "14:00" }),
      ),
    ).toBe(false);
  });
  it("nocturno vs diurno de madrugada", () => {
    expect(
      segmentsOverlap(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          crosses_midnight: true,
        }),
        shift({ start_time: "01:00", end_time: "05:00" }),
      ),
    ).toBe(true);
  });
  it("dos nocturnos solapados", () => {
    expect(
      segmentsOverlap(
        shift({
          start_time: "20:00",
          end_time: "02:00",
          crosses_midnight: true,
        }),
        shift({
          start_time: "22:00",
          end_time: "03:00",
          crosses_midnight: true,
        }),
      ),
    ).toBe(true);
  });
});

describe("shiftCardStyle", () => {
  it("usa el color del turno y fallback por defecto", () => {
    expect(shiftCardStyle("#ff0000").backgroundColor).toBe("#ff000022");
    expect(shiftCardStyle(undefined).borderColor).toBe(
      `${DEFAULT_SHIFT_COLOR}55`,
    );
  });
});
