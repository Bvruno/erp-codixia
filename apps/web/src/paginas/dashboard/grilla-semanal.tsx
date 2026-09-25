"use client";

import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { shiftDurationHours } from "@/lib/schedules";
import { usePreferenciasTrabajo } from "@/lib/use-preferencias-trabajo";
import type { Profile, Schedule, TimeEntry } from "@/types";

interface Props {
  entries: TimeEntry[];
  collaborators: Profile[];
  schedules: Schedule[];
  weekStart: Date;
  dailyTarget: number;
}

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function GrillaSemanal({
  entries,
  collaborators,
  schedules,
  weekStart,
  dailyTarget,
}: Props) {
  const { esLaborable } = usePreferenciasTrabajo();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const hoursFor = (userId: string, date: Date) =>
    entries
      .filter(
        (e) => e.user_id === userId && e.date === format(date, "yyyy-MM-dd"),
      )
      .reduce((sum, e) => sum + e.hours, 0);

  const plannedFor = (userId: string, date: Date) => {
    const sched = schedules.find(
      (s) => s.user_id === userId && s.day_of_week === date.getDay(),
    );
    return sched?.shift ? shiftDurationHours(sched.shift) : 0;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="text-left font-medium py-2 pr-2 w-36 truncate">Colaborador</th>
            {days.map((d, i) => (
              <th
                key={i}
                className={cn(
                  "font-medium py-2 px-1 text-center",
                  !esLaborable(d.getDay()) && "bg-muted/25",
                )}
              >
                <div>{DAY_LABELS[i]}</div>
                <div className="font-mono">{format(d, "dd/MM")}</div>
              </th>
            ))}
            <th className="font-medium py-2 pl-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {collaborators.map((user) => {
            const total = days.reduce(
              (sum, d) => sum + hoursFor(user.id, d),
              0,
            );
            return (
              <tr key={user.id} className="border-t">
                <td className="py-2 pr-2 font-medium">{user.full_name}</td>
                {days.map((d, i) => {
                  const h = hoursFor(user.id, d);
                  const planned = plannedFor(user.id, d);
                  return (
                    <td
                      key={i}
                      className={cn(
                        "px-1 py-2 text-center font-mono text-xs",
                        !esLaborable(d.getDay()) && "bg-muted/15",
                        h >= dailyTarget && "text-success font-semibold",
                        h > 0 && h < dailyTarget && "text-warning",
                      )}
                    >
                      {h > 0 ? `${h}h` : "—"}
                      <div
                        className={cn(
                          "text-xs font-normal",
                          planned > 0
                            ? "text-muted-foreground"
                            : esLaborable(d.getDay())
                              ? "text-warning"
                              : "text-muted-foreground/60",
                        )}
                      >
                        {planned > 0 ? `plan ${planned}h` : "sin turno"}
                      </div>
                    </td>
                  );
                })}
                <td className="py-2 pl-2 text-right font-mono font-semibold">
                  {total.toFixed(1)}h
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
