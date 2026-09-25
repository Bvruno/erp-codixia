"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/cliente";
import { useFormatoHora } from "@/lib/use-formato-hora";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, X } from "lucide-react";
import {
  DAY_LABELS,
  DAY_SHORT_LABELS,
  hasSchedule,
  scheduleConflictsWith,
  weeklyHoursFromSchedules,
} from "@/lib/schedules";
import type { Profile, Schedule, Shift } from "@/types";

interface Props {
  user: Profile;
  schedules: Schedule[];
  shifts: Shift[];
  orgId: string;
  createdBy: string;
  ownerId: string;
  onChange: () => void | Promise<void>;
}

export function ScheduleEditor({
  user,
  schedules,
  shifts,
  orgId,
  createdBy,
  ownerId,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { formatHora } = useFormatoHora();
  const router = useRouter();

  const userSchedules = schedules.filter((s) => s.user_id === user.id);

  const upsertDay = async (dayOfWeek: number, shiftId: string | null) => {
    const target = shiftId ? shifts.find((s) => s.id === shiftId) : null;
    if (target) {
      const conflict = scheduleConflictsWith(
        schedules,
        user.id,
        dayOfWeek,
        target,
      );
      if (conflict) {
        toast.error(
          `El turno "${target.name}" se solapa con "${conflict.name}" el ${DAY_LABELS[dayOfWeek]}`,
        );
        return;
      }
    }

    setSaving(true);
    try {
      const existing = userSchedules.find((s) => s.day_of_week === dayOfWeek);
      if (shiftId === null || shiftId === "") {
        if (existing) {
          try {
            await api.delete(`/horarios/schedules/${existing.id}`);
          } catch (e) {
            toast.error(
              (e instanceof Error ? e.message : "").includes("horario")
                ? "No puede quedarse sin horario: asigna otro turno antes"
                : "No se pudo eliminar el turno",
            );
            return;
          }
          toast.success("Turno eliminado");
        }
      } else if (existing) {
        try {
          await api.patch(`/horarios/schedules/${existing.id}`, { shift_id: shiftId });
        } catch {
          toast.error("No se pudo actualizar el turno");
          return;
        }
        toast.success("Turno actualizado");
      } else {
        try {
          await api.post("/horarios/schedules", {
            organization_id: orgId,
            user_id: user.id,
            shift_id: shiftId,
            day_of_week: dayOfWeek,
            created_by: createdBy,
          });
        } catch {
          toast.error("No se pudo asignar el turno");
          return;
        }
        toast.success(`Turno asignado para ${DAY_LABELS[dayOfWeek]}`);
      }
      await onChange();
    } catch {
      toast.error("Error al guardar el horario");
    } finally {
      setSaving(false);
    }
  };

  const isOwner = user.id === ownerId;
  const weeklyHours = weeklyHoursFromSchedules(schedules, user.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isOwner}
        title={isOwner ? "El dueño no requiere horario" : "Administrar horario"}
      >
        {hasSchedule(schedules, user.id) ? (
          <span className="flex items-center gap-1.5 text-xs">
            <CalendarDays className="size-3.5 text-success" />
            {userSchedules.length} día(s)
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle className="size-3.5" />
            Sin horario
          </span>
        )}
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Horario de {user.full_name}</DialogTitle>
        </DialogHeader>
        {isOwner ? (
          <p className="text-muted-foreground text-sm">
            El dueño de la organización está exento: no requiere horario.
          </p>
        ) : shifts.length === 0 ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              No hay turnos definidos. Crea los turnos (Mañana, Tarde, Noche)
              primero en Configuración para poder asignar horarios.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                router.push("/configuracion");
              }}
            >
              Ir a Configuración
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const s = userSchedules.find((x) => x.day_of_week === d);
                return (
                  <div
                    key={d}
                    className="flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <span className="text-sm font-medium w-16">
                      {DAY_SHORT_LABELS[d]}
                    </span>
                    {s ? (
                      <div className="flex items-center gap-1">
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: `${s.shift?.color}55` }}
                          title={
                            s.shift?.break_start_time && s.shift?.break_end_time
                              ? `Descanso ${formatHora(s.shift.break_start_time)}–${formatHora(s.shift.break_end_time)}`
                              : undefined
                          }
                        >
                          {s.shift?.name ?? "Turno"}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-6"
                          disabled={saving}
                          onClick={() => upsertDay(d, null)}
                          title="Quitar turno"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Select
                        value=""
                        onValueChange={(v) => upsertDay(d, v)}
                        disabled={saving}
                      >
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue placeholder="Asignar" />
                        </SelectTrigger>
                        <SelectContent>
                          {shifts.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 text-xs">
              <span className="text-muted-foreground">Carga semanal</span>
              <span className="font-semibold font-mono">{weeklyHours} h</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}