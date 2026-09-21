"use client";

import { useState } from "react";
import { api } from "@/lib/api/cliente";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Profile } from "@/types";

interface Props {
  orgId: string;
  isAdmin: boolean;
  collaborators: Profile[];
  onSaved: () => void;
}

const TYPES = [
  { value: "worked", label: "Trabajado" },
  { value: "overtime", label: "Extra" },
  { value: "makeup", label: "Recuperación" },
] as const;

export function RegistroHorasDialog({
  orgId,
  isAdmin,
  collaborators,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    user_id: "",
    date: new Date().toISOString().slice(0, 10),
    hours: "8",
    type: "worked" as (typeof TYPES)[number]["value"],
  });

  const submit = async () => {
    if (!form.date || !form.hours || Number(form.hours) <= 0) {
      toast.error("Fecha y horas válidas requeridas");
      return;
    }
    setSaving(true);
    try {
      await api.post("/horarios/entradas", {
        user_id: form.user_id,
        organization_id: orgId,
        date: form.date,
        hours: Number(form.hours),
        type: form.type,
      });
      await api.post("/auditoria", {
        organization_id: orgId,
        action: "create",
        entity: "time_entry",
        after: {
          date: form.date,
          hours: Number(form.hours),
          type: form.type,
        },
      }).catch(() => undefined);
      toast.success("Horas registradas");
      setOpen(false);
      setForm({
        ...form,
        date: new Date().toISOString().slice(0, 10),
        hours: "8",
      });
      onSaved();
    } catch {
      toast.error("No se pudieron registrar las horas");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar horas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isAdmin && (
            <div className="space-y-2">
              <Label>Colaborador</Label>
              <Select
                value={form.user_id}
                onValueChange={(v) => setForm({ ...form, user_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {collaborators.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Horas</Label>
              <Input
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                setForm({ ...form, type: v as (typeof TYPES)[number]["value"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            onClick={submit}
            disabled={saving || (isAdmin && !form.user_id)}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
