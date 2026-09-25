"use client";

import { useState } from "react";
import { api } from "@/lib/api/cliente";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import type { TimeEntry } from "@/types";

interface Props {
  orgId: string;
  entries: TimeEntry[];
  isAdmin: boolean;
  currentUserId: string;
  onChanged: () => void;
}

const TYPE_BADGES: Record<string, string> = {
  worked: "bg-info/20 text-info",
  overtime: "bg-purple-500/20 text-purple-400",
  makeup: "bg-success/20 text-success",
};

const TYPE_LABELS: Record<string, string> = {
  worked: "Trabajado",
  overtime: "Extra",
  makeup: "Recuperación",
};

export function EntradasTabla({
  orgId,
  entries,
  isAdmin,
  currentUserId,
  onChanged,
}: Props) {
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [editForm, setEditForm] = useState({
    date: "",
    hours: "",
    type: "worked" as TimeEntry["type"],
  });
  const [deleteTarget, setDeleteTarget] = useState<TimeEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = (entry: TimeEntry) =>
    isAdmin || entry.user_id === currentUserId;

  const openEdit = (entry: TimeEntry) => {
    setEditing(entry);
    setEditForm({
      date: entry.date,
      hours: String(entry.hours),
      type: entry.type,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/horarios/entradas/${editing.id}`, {
        date: editForm.date,
        hours: Number(editForm.hours),
        type: editForm.type,
      });
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "update",
        entity: "time_entry",
        before: editing,
        after: editForm,
      }).catch(() => undefined);
      toast.success("Entrada actualizada");
      setEditing(null);
      onChanged();
    } catch {
      toast.error("No se pudo actualizar la entrada");
    }
    setBusy(false);
  };

  const deleteEntry = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/horarios/entradas/${deleteTarget.id}`);
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "delete",
        entity: "time_entry",
        before: deleteTarget,
      }).catch(() => undefined);
      toast.success("Entrada eliminada");
      setDeleteTarget(null);
      onChanged();
    } catch {
      toast.error("No se pudo eliminar la entrada");
    }
    setBusy(false);
  };

  const sorted = [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || a.user_id.localeCompare(b.user_id),
  );

  return (
    <>
      {sorted.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Sin horas registradas"
          description="Registra horas para ver el detalle aquí"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && <TableHead>Colaborador</TableHead>}
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Horas</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => (
              <TableRow key={entry.id}>
                {isAdmin && (
                  <TableCell className="text-sm">
                    {entry.user?.full_name ?? "—"}
                  </TableCell>
                )}
                <TableCell className="text-sm">
                  {new Date(entry.date + "T00:00:00").toLocaleDateString("es")}
                </TableCell>
                <TableCell>
                  <Badge className={TYPE_BADGES[entry.type]}>
                    {TYPE_LABELS[entry.type] ?? entry.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-mono">
                  {entry.hours}h
                </TableCell>
                <TableCell>
                  {canEdit(entry) && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(entry)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={editForm.date}
                onChange={(e) =>
                  setEditForm({ ...editForm, date: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Horas</Label>
                <Input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={editForm.hours}
                  onChange={(e) =>
                    setEditForm({ ...editForm, hours: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={editForm.type}
                  onValueChange={(v) =>
                    setEditForm({
                      ...editForm,
                      type: v as "worked" | "overtime" | "makeup",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit} disabled={busy}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="¿Eliminar entrada?"
        description="Las horas registradas se eliminarán del cálculo."
        confirmLabel="Eliminar"
        variant="destructive"
        loading={busy}
        onConfirm={deleteEntry}
      />
    </>
  );
}
