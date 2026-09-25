'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/cliente';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PriorityDef, StatusDef } from '@/types';

type Mode =
  | { type: 'list'; listId: string }
  | { type: 'workspace'; wsId: string };

const PASTEL_COLORS = [
  '#f1a7a7', '#f7b9a5', '#f9d5a7', '#f9e3a7', '#d7e8a7',
  '#a7e8b4', '#a7e8d1', '#a7d7e8', '#a7b8e8', '#b8a7e8',
  '#d1a7e8', '#e8a7d1', '#e8a7b8', '#c9c9c9', '#8f9aa8',
];

const VIVID_COLORS = [
  '#e53935', '#f4511e', '#fb8c00', '#fdd835', '#7cb342',
  '#43a047', '#26a69a', '#29b6f6', '#1e88e5', '#3949ab',
  '#8e24aa', '#d81b60', '#ec407a', '#757575', '#546e7a',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-transparent transition-transform hover:scale-105"
          style={{ backgroundColor: value }}
          title="Color"
        />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="grid grid-cols-5 gap-1.5">
          {PASTEL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className={cn(
                'size-8 cursor-pointer rounded-md border transition-transform hover:scale-110',
                value === c && 'ring-2 ring-ring ring-offset-1'
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
        <div className="mt-1.5 border-t pt-1.5">
          <p className="mb-1.5 px-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Vivos
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {VIVID_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={cn(
                  'size-8 cursor-pointer rounded-md border transition-transform hover:scale-110',
                  value === c && 'ring-2 ring-ring ring-offset-1'
                )}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function slugify(label: string, taken: Set<string>): string {
  const base = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'nuevo';
  let key = base;
  let i = 2;
  while (taken.has(key)) key = `${base}_${i++}`;
  return key;
}

export function StatusConfigDialog({
  open,
  onOpenChange,
  mode,
  initialStatuses,
  initialPriorities,
  inUseStatuses = new Set<string>(),
  inUsePriorities = new Set<string>(),
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  initialStatuses: StatusDef[];
  initialPriorities: PriorityDef[];
  inUseStatuses?: Set<string>;
  inUsePriorities?: Set<string>;
  onSaved: () => void;
}) {
  const [statuses, setStatuses] = useState<StatusDef[]>(initialStatuses);
  const [priorities, setPriorities] = useState<PriorityDef[]>(initialPriorities);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatuses(initialStatuses);
      setPriorities(initialPriorities);
      setError('');
    }
  }, [open, initialStatuses, initialPriorities]);

  const setStatus = (i: number, patch: Partial<StatusDef>) => {
    setStatuses((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const setPriority = (i: number, patch: Partial<PriorityDef>) => {
    setPriorities((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
    const next = [...arr];
    const j = i + dir;
    if (j < 0 || j >= next.length) return next;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  const addStatus = () => {
    setStatuses((prev) => {
      const taken = new Set(prev.map((s) => s.key));
      return [...prev, { key: slugify('nuevo_estado', taken), label: 'Nuevo estado', color: '#3b82f6' }];
    });
  };

  const addPriority = () => {
    setPriorities((prev) => {
      const taken = new Set(prev.map((p) => p.key));
      return [...prev, { key: slugify('nueva_prioridad', taken), label: 'Nueva prioridad', color: '#f97316' }];
    });
  };

  const removeStatus = (i: number) => {
    setStatuses((prev) => prev.filter((_, idx) => idx !== i));
  };

  const removePriority = (i: number) => {
    setPriorities((prev) => prev.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    const id = mode.type === 'list' ? mode.listId : mode.wsId;
    const patch: Record<string, unknown> =
      mode.type === 'list'
        ? {
            statuses: statuses.map(({ key, label, color, hidden_by_default }) => ({
              key, label, color, ...(hidden_by_default ? { hidden_by_default: true } : {}),
            })),
            priorities: priorities.map(({ key, label, color }) => ({ key, label, color })),
          }
        : {
            default_statuses: statuses.map(({ key, label, color, hidden_by_default }) => ({
              key, label, color, ...(hidden_by_default ? { hidden_by_default: true } : {}),
            })),
            default_priorities: priorities.map(({ key, label, color }) => ({ key, label, color })),
          };
    try {
      await api.patch(`/entidades/${mode.type}/${id}`, patch);
    } catch {
      setError('No se pudo guardar la configuración');
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode.type === 'list' ? 'Estados y prioridades de la lista' : 'Estados y prioridades por defecto'}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="statuses">
          <TabsList className="w-full">
            <TabsTrigger value="statuses" className="flex-1">Estados</TabsTrigger>
            <TabsTrigger value="priorities" className="flex-1">Prioridades</TabsTrigger>
          </TabsList>
          <TabsContent value="statuses" className="space-y-2 pt-2">
            {statuses.map((s, i) => (
              <div key={`${s.key}-${i}`} className="flex flex-wrap items-center gap-2">
                <ColorPicker value={s.color} onChange={(color) => setStatus(i, { color })} />
                <Input
                  value={s.label}
                  onChange={(e) => setStatus(i, { label: e.target.value })}
                  className="h-8 min-w-[100px] flex-1 text-sm"
                />
                <Label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  Ocultar por defecto
                  <Checkbox
                    checked={!!s.hidden_by_default}
                    onCheckedChange={(v) => setStatus(i, { hidden_by_default: v === true })}
                  />
                </Label>
                <Button variant="ghost" size="sm" className="h-7 px-1.5" disabled={i === 0} onClick={() => setStatuses((prev) => move(prev, i, -1))} title="Subir">
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-1.5" disabled={i === statuses.length - 1} onClick={() => setStatuses((prev) => move(prev, i, 1))} title="Bajar">
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-red-600 hover:text-red-700"
                  disabled={statuses.length <= 1 || inUseStatuses.has(s.key)}
                  onClick={() => removeStatus(i)}
                  title={
                    inUseStatuses.has(s.key)
                      ? 'En uso por tareas, no se puede eliminar'
                      : statuses.length <= 1
                        ? 'Debe quedar al menos un estado'
                        : 'Eliminar'
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addStatus} className="mt-2">
              <Plus className="size-3.5" /> Agregar estado
            </Button>
          </TabsContent>
          <TabsContent value="priorities" className="space-y-2 pt-2">
            {priorities.map((p, i) => (
              <div key={`${p.key}-${i}`} className="flex flex-wrap items-center gap-2">
                <ColorPicker value={p.color} onChange={(color) => setPriority(i, { color })} />
                <Input
                  value={p.label}
                  onChange={(e) => setPriority(i, { label: e.target.value })}
                  className="h-8 min-w-[100px] flex-1 text-sm"
                />
                <Button variant="ghost" size="sm" className="h-7 px-1.5" disabled={i === 0} onClick={() => setPriorities((prev) => move(prev, i, -1))} title="Subir">
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-1.5" disabled={i === priorities.length - 1} onClick={() => setPriorities((prev) => move(prev, i, 1))} title="Bajar">
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-red-600 hover:text-red-700"
                  disabled={priorities.length <= 1 || inUsePriorities.has(p.key)}
                  onClick={() => removePriority(i)}
                  title={
                    inUsePriorities.has(p.key)
                      ? 'En uso por tareas, no se puede eliminar'
                      : priorities.length <= 1
                        ? 'Debe quedar al menos una prioridad'
                        : 'Eliminar'
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addPriority} className="mt-2">
              <Plus className="size-3.5" /> Agregar prioridad
            </Button>
          </TabsContent>
        </Tabs>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
