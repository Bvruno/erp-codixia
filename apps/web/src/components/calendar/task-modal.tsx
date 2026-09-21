'use client';

import { useRef, useState } from 'react';
import { api, apiFetch } from '@/lib/api/cliente';
import { sesionActual } from '@/lib/auth/sesion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AssigneeSelect } from '@/components/tareas/assignee-select';
import { resolveStatuses, resolvePriorities, hiddenStatuses } from '@/lib/task-config';
import { friendlyTaskError } from '@/lib/task-errors';
import { saveAssignmentGrants } from '@/lib/auth/actions';
import { useAssignAccess, type GrantDraft } from '@/components/tareas/assign-access-dialog';
import type { AccessTree } from '@/lib/access';
import type { TaskList, Profile } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ListTodo } from 'lucide-react';

export function TaskModal({
  open,
  onClose,
  onSaved,
  organizationId,
  lists,
  collaborators,
  isAdmin,
  defaultDate,
  tree,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  organizationId: string | null;
  lists: TaskList[];
  collaborators: Profile[];
  isAdmin: boolean;
  defaultDate: Date;
  tree: AccessTree;
}) {
  const { openAssignAccess, dialog: assignAccessDialog } = useAssignAccess(tree);
  const [title, setTitle] = useState('');
  const [listId, setListId] = useState<string>(lists[0]?.id ?? '');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(format(defaultDate, 'yyyy-MM-dd'));
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const grantDraftRef = useRef<{ assigneeId: string; grants: GrantDraft[] } | null>(null);

  const selectedList = lists.find((l) => l.id === listId) ?? null;
  const statuses = resolveStatuses(selectedList?.statuses);
  const priorities = resolvePriorities(selectedList?.priorities);

  const selectList = (id: string) => {
    setListId(id);
    const defs = resolveStatuses(lists.find((l) => l.id === id)?.statuses);
    const defPriorities = resolvePriorities(lists.find((l) => l.id === id)?.priorities);
    const hidden = hiddenStatuses(defs);
    setStatus(defs.find((s) => !hidden.has(s.key))?.key ?? defs[0]?.key ?? '');
    setPriority(defPriorities[0]?.key ?? '');
    grantDraftRef.current = null;
    setAssignedTo(null);
  };

  const assign = (assigneeId: string) => {
    const assignee = collaborators.find((c) => c.id === assigneeId);
    if (!assignee) {
      setAssignedTo(assigneeId);
      return;
    }
    openAssignAccess(assignee, selectedList?.id ?? null, (grants) => {
      setAssignedTo(assigneeId);
      grantDraftRef.current = { assigneeId, grants };
    });
  };

  const save = async () => {
    if (!title.trim() || !listId || !organizationId) return;
    setSaving(true);
    const sesion = await sesionActual();
    if (!sesion) {
      setSaving(false);
      toast.error('Debes iniciar sesión');
      return;
    }
    const posRes = await apiFetch<{ posicion: number }>(
      `/tareas/posicion?list_id=${encodeURIComponent(listId)}`
    ).catch(() => null);
    const position = (posRes?.posicion ?? 0) + 1;

    try {
      await api.post('/tareas', {
        organization_id: organizationId,
        list_id: listId,
        title: title.trim(),
        description: null,
        status: status || statuses[0]?.key || 'backlog',
        priority: priority || priorities[0]?.key || 'medium',
        assigned_to: assignedTo,
        created_by: sesion.userId,
        shift_id: null,
        due_date: dueDate || null,
        due_time: dueTime || null,
        start_date: null,
        estimated_hours: null,
        parent_task_id: null,
        position,
      });
    } catch (e) {
      setSaving(false);
      toast.error(friendlyTaskError(e instanceof Error ? e.message : 'No se pudo crear'));
      return;
    }

    const draft = grantDraftRef.current;
    if (draft && draft.grants.length > 0) {
      const res = await saveAssignmentGrants({
        assigneeId: draft.assigneeId,
        mainListId: listId,
        grants: draft.grants,
      });
      if (res?.error) toast.error(res.error);
    }

    setSaving(false);
    grantDraftRef.current = null;
    toast.success('Tarea creada');
    onClose();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="size-4" />
            Nueva tarea
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title" className="text-xs font-semibold text-muted-foreground">
              Título
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void save();
              }}
              placeholder="Título de la tarea"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Lista</Label>
            {lists.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                No tenés acceso de escritura a ninguna lista. Pedí acceso o creá una lista desde Proyectos.
              </p>
            ) : (
              <Select value={listId} onValueChange={selectList}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Elegí una lista" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Persona asignada</Label>
            <AssigneeSelect
              value={assignedTo ?? ''}
              onSelect={(id) => {
                if (!id) {
                  setAssignedTo(null);
                  grantDraftRef.current = null;
                  return;
                }
                assign(id);
              }}
              collaborators={collaborators}
              isAdmin={isAdmin}
              organizationId={organizationId}
              listId={selectedList?.id}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Fecha límite</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Hora</Label>
              <Input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Prioridad</Label>
              <Select
                value={priority || priorities[0]?.key || ''}
                onValueChange={setPriority}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Estado</Label>
              <Select value={status || statuses[0]?.key || ''} onValueChange={setStatus}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving || !title.trim() || !listId}>
            {saving ? 'Creando…' : 'Crear tarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
      {assignAccessDialog}
    </Dialog>
  );
}