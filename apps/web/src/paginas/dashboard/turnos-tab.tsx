"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiFetch } from "@/lib/api/cliente";
import { TTL_CACHE } from "@/lib/cache-claves";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Trash2, Plus, Pencil, Clock, Moon, Coffee, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  breakWithinShift,
  isOvernightShift,
  segmentsOverlap,
} from "@/lib/shift-utils";
import { TimePicker } from "@/components/ui/time-picker";
import { ColorPicker, SHIFT_COLORS } from "./color-picker";
import { useFormatoHora } from "@/lib/use-formato-hora";
import { usePreferenciasTrabajo } from "@/lib/use-preferencias-trabajo";
import type { Shift } from "@/types";

interface Props {
  orgId: string;
}

interface ShiftForm {
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  crosses_midnight?: boolean;
  break_start_time: string;
  break_end_time: string;
}

const EMPTY_FORM: ShiftForm = {
  name: "",
  start_time: "",
  end_time: "",
  color: SHIFT_COLORS[0],
  crosses_midnight: false,
  break_start_time: "",
  break_end_time: "",
};

// Descanso por defecto: 1 hora centrada en la mitad del turno.
function defaultBreak(shift: ShiftForm): { start: string; end: string } {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const pad = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const start = toMin(shift.start_time);
  const end = toMin(shift.end_time);
  if (Number.isNaN(start) || Number.isNaN(end)) return { start: "12:00", end: "13:00" };
  const len = end > start ? end - start : 1440 - start + end;
  if (len < 60) return { start: "12:00", end: "13:00" };
  const mid = (start + len / 2) % 1440;
  const bs = Math.floor(mid - 30);
  const be = Math.floor(mid + 30);
  return {
    start: pad(((bs % 1440) + 1440) % 1440),
    end: pad(((be % 1440) + 1440) % 1440),
  };
}

function BreakFields({
  form,
  onChange,
}: {
  form: ShiftForm;
  onChange: (form: ShiftForm) => void;
}) {
  const hasBreak = !!(form.break_start_time && form.break_end_time);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id="has-break"
          checked={hasBreak}
          onCheckedChange={(v) => {
            if (v) {
              const def = defaultBreak(form);
              onChange({
                ...form,
                break_start_time: def.start,
                break_end_time: def.end,
              });
            } else {
              onChange({ ...form, break_start_time: "", break_end_time: "" });
            }
          }}
        />
        <Label htmlFor="has-break" className="cursor-pointer">
          Descanso / hora de comida
        </Label>
      </div>
      {hasBreak && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Inicio descanso</Label>
            <TimePicker
              value={form.break_start_time}
              onChange={(break_start_time) => onChange({ ...form, break_start_time })}
            />
          </div>
          <div className="space-y-2">
            <Label>Fin descanso</Label>
            <TimePicker
              value={form.break_end_time}
              onChange={(break_end_time) => onChange({ ...form, break_end_time })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function TurnosTab({ orgId }: Props) {
  const { formatHora } = useFormatoHora();
  const { workdayStart } = usePreferenciasTrabajo();
  const [newShift, setNewShift] = useState<ShiftForm>(() => ({
    ...EMPTY_FORM,
    start_time: workdayStart,
  }));
  const [editing, setEditing] = useState<Shift | null>(null);
  const [editForm, setEditForm] = useState<ShiftForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [affectedCount, setAffectedCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const queryClient = useQueryClient();
  const shiftsQuery = useQuery({
    queryKey: ['horarios', 'shifts', orgId],
    queryFn: async () => {
      const res = await apiFetch<{ shifts: Shift[] }>(
        `/horarios/shifts?organization_id=${encodeURIComponent(orgId)}`
      );
      return res.shifts;
    },
    // Catálogo casi estático: se invalida al crear/editar/borrar.
    staleTime: TTL_CACHE.catalogo,
    refetchOnWindowFocus: false,
  });
  const shifts = shiftsQuery.data ?? [];
  const loading = shiftsQuery.isPending;
  useEffect(() => {
    if (shiftsQuery.isError) toast.error("No se pudieron cargar los turnos");
  }, [shiftsQuery.isError]);
  const refetchShifts = () => {
    void queryClient.invalidateQueries({ queryKey: ['horarios', 'shifts', orgId] });
  };

  const validate = (form: ShiftForm): string | null => {
    if (!form.name || !form.start_time || !form.end_time) {
      return "Completa nombre, inicio y fin";
    }
    if (form.start_time === form.end_time) {
      return "La hora de inicio y fin no pueden ser iguales";
    }
    const hasBreak = !!(form.break_start_time && form.break_end_time);
    if (hasBreak) {
      if (form.break_start_time === form.break_end_time) {
        return "El inicio y fin del descanso no pueden ser iguales";
      }
      if (!breakWithinShift(form)) {
        return "El descanso debe estar dentro del turno";
      }
    }
    const conflict = shifts.some((s) => {
      if (editing && s.id === editing.id) return false;
      return segmentsOverlap(
        { ...form, crosses_midnight: isOvernightShift(form) },
        {
          start_time: s.start_time,
          end_time: s.end_time,
          color: s.color,
          crosses_midnight: s.crosses_midnight,
        },
      );
    });
    if (conflict) {
      return "El turno se solapa con otro turno existente";
    }
    return null;
  };

  const addShift = async () => {
    const errorMsg = validate(newShift);
    if (errorMsg) {
      toast.error(errorMsg);
      return;
    }
    setSaving(true);
    try {
      await api.post("/horarios/shifts", {
        organization_id: orgId,
        name: newShift.name.trim(),
        start_time: newShift.start_time,
        end_time: newShift.end_time,
        color: newShift.color,
        crosses_midnight: isOvernightShift(newShift),
        break_start_time: newShift.break_start_time || null,
        break_end_time: newShift.break_end_time || null,
      });
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "create",
        entity: "shift",
        after: { ...newShift },
      }).catch(() => undefined);
      toast.success("Turno creado");
      setNewShift(EMPTY_FORM);
      refetchShifts();
    } catch {
      toast.error("No se pudo crear el turno");
    }
    setSaving(false);
  };

  const openEdit = (shift: Shift) => {
    setEditing(shift);
    setEditForm({
      name: shift.name,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      color: shift.color || SHIFT_COLORS[0],
      crosses_midnight: shift.crosses_midnight,
      break_start_time: shift.break_start_time?.slice(0, 5) || "",
      break_end_time: shift.break_end_time?.slice(0, 5) || "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const errorMsg = validate(editForm);
    if (errorMsg) {
      toast.error(errorMsg);
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/horarios/shifts/${editing.id}`, {
        name: editForm.name.trim(),
        start_time: editForm.start_time,
        end_time: editForm.end_time,
        color: editForm.color,
        crosses_midnight: isOvernightShift(editForm),
        break_start_time: editForm.break_start_time || null,
        break_end_time: editForm.break_end_time || null,
      });
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "update",
        entity: "shift",
        before: editing,
        after: { ...editForm },
      }).catch(() => undefined);
      toast.success("Turno actualizado");
      setEditing(null);
      refetchShifts();
    } catch {
      toast.error("No se pudo actualizar el turno");
    }
    setSaving(false);
  };

  const openDelete = async (shift: Shift) => {
    setDeleteTarget(shift);
    const res = await apiFetch<{ tasks: number; schedules: number }>(
      `/horarios/shifts/${shift.id}/uso`
    ).catch(() => ({ tasks: 0, schedules: 0 }));
    if ((res.schedules ?? 0) > 0) {
      toast.error(
        "El turno está asignado en horarios de colaboradores: quita esas asignaciones antes",
      );
      setDeleteTarget(null);
      return;
    }
    setAffectedCount(res.tasks ?? 0);
    setConfirmOpen(true);
  };

  const deleteShift = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await api.delete(`/horarios/shifts/${deleteTarget.id}`);
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "delete",
        entity: "shift",
        before: deleteTarget,
      }).catch(() => undefined);
      toast.success("Turno eliminado");
      setConfirmOpen(false);
      refetchShifts();
    } catch {
      toast.error("No se pudo eliminar el turno");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Turnos</CardTitle>
        <CardDescription>
          Define los turnos de trabajo (Mañana, Tarde, Noche)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 items-end sm:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>Nombre</Label>
            <Input
              value={newShift.name}
              onChange={(e) =>
                setNewShift({ ...newShift, name: e.target.value })
              }
              placeholder="Mañana"
            />
          </div>
          <div className="space-y-2 w-full">
            <Label>Inicio</Label>
            <TimePicker
              value={newShift.start_time}
              onChange={(start_time) =>
                setNewShift({ ...newShift, start_time })
              }
            />
          </div>
          <div className="space-y-2 w-full">
            <Label>Fin</Label>
            <TimePicker
              value={newShift.end_time}
              onChange={(end_time) => setNewShift({ ...newShift, end_time })}
            />
          </div>
          <div className="space-y-2 w-full">
            <Label>Color</Label>
            <ColorPicker
              value={newShift.color}
              onChange={(color) => setNewShift({ ...newShift, color })}
            />
          </div>
          <Button size="icon" onClick={addShift} disabled={saving} aria-busy={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </Button>
        </div>

        <BreakFields form={newShift} onChange={setNewShift} />

        {shifts.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Sin turnos"
            description="Crea el primer turno para asignarlo a tareas"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Descanso</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>
                    <Badge variant="secondary" className="gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{
                          backgroundColor: shift.color || SHIFT_COLORS[0],
                        }}
                      />
                      {shift.name}
                    </Badge>
                    {shift.crosses_midnight && (
                      <span
                        className="text-muted-foreground flex items-center gap-1 text-xs"
                        title="Cruza medianoche"
                      >
                        <Moon className="size-3" />
                        Nocturno
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{formatHora(shift.start_time)}</TableCell>
                  <TableCell>{formatHora(shift.end_time)}</TableCell>
                  <TableCell>
                    {shift.break_start_time && shift.break_end_time && (
                      <span
                        className="text-muted-foreground flex items-center gap-1 text-xs"
                        title="Descanso / hora de comida"
                      >
                        <Coffee className="size-3" />
                        {formatHora(shift.break_start_time)} – {formatHora(shift.break_end_time)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      
                      onClick={() => openEdit(shift)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => openDelete(shift)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                placeholder="Mañana"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Inicio</Label>
                <TimePicker
                  value={editForm.start_time}
                  onChange={(start_time) =>
                    setEditForm({ ...editForm, start_time })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Fin</Label>
                <TimePicker
                  value={editForm.end_time}
                  onChange={(end_time) =>
                    setEditForm({ ...editForm, end_time })
                  }
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Color</Label>
                <ColorPicker
                  value={editForm.color}
                  onChange={(color) => setEditForm({ ...editForm, color })}
                />
              </div>
            </div>
            <BreakFields form={editForm} onChange={setEditForm} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Eliminar turno?"
        description={
          affectedCount > 0
            ? `${affectedCount} tarea(s) asignadas a este turno quedarán sin turno.`
            : "Las tareas asignadas a este turno quedarán sin turno."
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={saving}
        onConfirm={deleteShift}
      />
    </Card>
  );
}
