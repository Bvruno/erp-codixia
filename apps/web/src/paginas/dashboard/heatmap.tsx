"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { usePerfil } from "@/lib/use-perfil";
import { usePreferenciasTrabajo } from "@/lib/use-preferencias-trabajo";
import { DEFAULT_PREFERENCES, type TimeEntry } from "@/types";

interface Props {
  entries: TimeEntry[];
  month: Date;
  dailyTarget: number;
}

const DIAS_LUN = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_DOM = ["D", "L", "M", "X", "J", "V", "S"];

function intensity(hours: number, target: number): string {
  if (hours <= 0) return "bg-muted";
  if (hours < target * 0.5) return "bg-amber-200 dark:bg-amber-500/30";
  if (hours < target) return "bg-blue-300 dark:bg-blue-500/50";
  return "bg-emerald-400 dark:bg-emerald-500/60";
}

export function HeatmapHoras({ entries, month, dailyTarget }: Props) {
  const perfilQuery = usePerfil({ enabled: false });
  const { esLaborable } = usePreferenciasTrabajo();
  const weekStartsOn =
    (perfilQuery.data?.profile?.preferences?.week_start ??
      DEFAULT_PREFERENCES.week_start) === "sunday"
      ? 0
      : 1;
  const year = month.getFullYear();
  const monthIdx = month.getMonth();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const firstOffset =
    (new Date(year, monthIdx, 1).getDay() - weekStartsOn + 7) % 7;
  const dias = weekStartsOn === 1 ? DIAS_LUN : DIAS_DOM;

  const byDay = new Map<string, number>();
  entries.forEach((e) => {
    const key = e.date.slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + e.hours);
  });

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-muted size-3 rounded" /> Sin horas
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-amber-200 dark:bg-amber-500/30 size-3 rounded" />{" "}
          Parcial
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-blue-300 dark:bg-blue-500/50 size-3 rounded" /> En
          meta
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-emerald-400 dark:bg-emerald-500/60 size-3 rounded" />{" "}
          Meta cumplida
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {dias.map((d) => (
          <div
            key={d}
            className="text-muted-foreground text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
        {cells.map((date, idx) => {
          if (!date) return <div key={`empty-${idx}`} />;
          const hours = byDay.get(date) ?? 0;
          return (
            <div
              key={date}
              title={`${format(new Date(date + "T00:00:00"), "d MMM", { locale: es })}: ${hours}h`}
              className={cn(
                "flex aspect-square items-center justify-center rounded text-xs font-mono",
                intensity(hours, dailyTarget),
                hours > 0 && "text-foreground",
                hours === 0 &&
                  !esLaborable(new Date(date + "T00:00:00").getDay()) &&
                  "opacity-45",
              )}
            >
              {hours > 0 ? format(hours, "0.#") : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
