'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { usePathname } from 'next/navigation';
import { useNavigate } from '@tanstack/react-router';
import { usePerfil } from '@/lib/use-perfil';
import { aplicarEventoLista, leerEvento, parchearQuery } from '@/lib/realtime-cache';
import { api, apiFetch } from '@/lib/api/cliente';
import { entitySlug, findEntityByParam, isFullUuid, shortUid } from '@/lib/slugs';
import { copiarTexto } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Send, Circle, Flag, User, Clock,
  Calendar, Hash, Trash2, Loader2, UserPlus, SquareCheckBig, MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import type { Task, TaskNote, Profile, Shift, TaskActivityLog, StatusDef, PriorityDef } from '@/types';
import { resolveStatuses, resolvePriorities, statusLabel } from '@/lib/task-config';
import { useTareasOpcional } from '@/components/tareas/tareas-context';
import { useFormatoHora } from '@/lib/use-formato-hora';
import { saveAssignmentGrants, createInvitation } from '@/lib/auth/actions';
import { useAssignAccess, type GrantDraft } from '@/components/tareas/assign-access-dialog';
import { AccionEntidad } from '@/components/entidad/accion-entidad';
import { CabeceraEntidad, TituloEditableEntidad } from '@/components/entidad/cabecera-entidad';
import { PanelEntidad } from '@/components/entidad/panel-entidad';
import { EntidadPagina } from '@/components/entidad/entidad-pagina';
import { EstadoEntidad, EsqueletoEntidad } from '@/components/entidad/estado-entidad';
import type { AccessTree } from '@/lib/access';

type TaskDetailPayload = {
  tarea: Task | null;
  notas: TaskNote[];
  actividad: TaskActivityLog[];
  subtareas: Task[];
  shifts: Shift[];
  perfil: Profile | null;
  parentTitle: string | null;
  chain: { workspace: string; folder: string | null; list: string; listPath: string } | null;
  statuses: StatusDef[];
  priorities: PriorityDef[];
};

const ARBOL_VACIO: AccessTree = {
  workspaces: [],
  folders: [],
  lists: [],
  documents: [],
  mindmaps: [],
  todos: [],
  formularios: [],
};

export type TaskDetailProps = {
  taskId: string;
  /** Presente al montar el detalle dentro de un modal: desactiva la
   *  navegación forzada y habilita los datos de reemplazo del árbol. */
  onClose?: () => void;
  onDeleted?: () => void;
  onChanged?: () => void;
  arbol?: AccessTree;
  colaboradores?: Profile[];
  esAdmin?: boolean;
  listasEscribibles?: string[] | null;
  /** Presente cuando el detalle vive en un offcanvas: al pulsar una
   *  sub-tarea se cambia el contenido del panel en vez de navegar. */
  onOpenTask?: (id: string) => void;
};

export function TaskDetail({
  taskId,
  onClose,
  onDeleted,
  onChanged,
  arbol,
  colaboradores,
  esAdmin,
  listasEscribibles,
  onOpenTask,
}: TaskDetailProps) {
  const ctx = useTareasOpcional();
  const enModal = !!onClose;
  const pathname = usePathname();
  const navigate = useNavigate();
  const { formatHoraDeFecha } = useFormatoHora();

  const arbolActual: AccessTree = useMemo(
    () =>
      ctx
        ? {
            workspaces: ctx.workspaces,
            folders: ctx.folders,
            lists: ctx.lists,
            documents: ctx.documents,
            mindmaps: ctx.mindmaps,
            todos: ctx.todos,
            formularios: ctx.formularios,
          }
        : arbol ?? ARBOL_VACIO,
    [ctx, arbol]
  );
  const colaboradoresCtx = ctx?.collaborators;
  const colaboradoresActuales = useMemo(
    () => colaboradoresCtx ?? colaboradores ?? [],
    [colaboradoresCtx, colaboradores]
  );
  const esAdminActual = ctx?.isAdmin ?? esAdmin ?? false;
  const cargandoEstructura = ctx?.loading ?? false;

// Resolver prefijo corto → UUID completo consultando las tareas de la
// lista actual (las tareas no viven en el contexto de estructura). La lista
// se deriva del pathname estable (por id) para no repetir el GET cuando
// cambia la identidad de `ctx.lists` o el slug de la URL.
const needsResolution = !isFullUuid(taskId);
const [resolvedTaskId, setResolvedTaskId] = useState<string | null>(null);
const resolucionIntentadaRef = useRef(false);

const segsRuta = pathname.split('/').filter(Boolean);
const listParamRuta =
  segsRuta[0] === 'proyectos' &&
  segsRuta.length >= 4 &&
  segsRuta[3] !== 'dashboard' &&
  segsRuta[3] !== 'documento' &&
  segsRuta[3] !== 'mapa' &&
  segsRuta[3] !== 'todo'
    ? segsRuta[3]
    : null;
const listDeRuta = listParamRuta
  ? findEntityByParam(listParamRuta, arbolActual.lists)
  : undefined;
const listDeRutaId = listDeRuta?.id ?? null;

useEffect(() => {
  if (!needsResolution || resolucionIntentadaRef.current) return;
  if (!listDeRutaId) {
    // Sin lista resoluble: no insistir cuando el árbol aún carga; en
    // cuanto termina, se usa el taskId tal cual (no habrá coincidencia).
    if (cargandoEstructura) return;
    const t = setTimeout(() => {
      resolucionIntentadaRef.current = true;
      setResolvedTaskId(taskId);
    }, 0);
    return () => clearTimeout(t);
  }
  resolucionIntentadaRef.current = true;
  void apiFetch<{ tasks: { id: string }[] }>(
    `/tareas?list_id=${encodeURIComponent(listDeRutaId)}&solo_ids=true`
  )
    .then(({ tasks }) => {
      const hit = tasks.find((t) =>
        t.id.replace(/-/g, '').startsWith(taskId)
      );
      setResolvedTaskId(hit?.id ?? taskId);
    })
    .catch(() => setResolvedTaskId(taskId));
}, [needsResolution, taskId, listDeRutaId, cargandoEstructura]);

const fullTaskId = needsResolution ? resolvedTaskId : taskId;

  const [task, setTask] = useState<Task | null>(null);
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [activity, setActivity] = useState<TaskActivityLog[]>([]);
  const [subTasks, setSubTasks] = useState<Task[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [collaborators, setCollaborators] = useState<Profile[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'notes' | 'timeline'>('notes');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [parentTitle, setParentTitle] = useState<string | null>(null);
  const [chain, setChain] = useState<{ workspace: string; folder: string | null; list: string; listPath: string } | null>(null);
  const [statuses, setStatuses] = useState<StatusDef[]>([]);
  const [priorities, setPriorities] = useState<PriorityDef[]>([]);

  const canEdit = task?.list_id
    ? ctx
      ? ctx.canWrite('list', task.list_id)
      : esAdminActual ||
        listasEscribibles === null ||
        (listasEscribibles?.includes(task.list_id) ?? false)
    : false;

  const { openAssignAccess, dialog: assignAccessDialog } = useAssignAccess(arbolActual);

  const saveGrants = async (assigneeId: string, grants: GrantDraft[]) => {
    if (grants.length === 0) return;
    const res = await saveAssignmentGrants({ assigneeId, mainListId: task?.list_id, grants });
    if (res?.error) {
      toast.error(res.error);
    } else if (res?.note) {
      toast.info(res.note);
    }
  };

  const queryClient = useQueryClient();
  const perfilQuery = usePerfil();
  const taskQuery = useQuery({
    queryKey: ['tarea', 'detalle', fullTaskId],
    queryFn: async (): Promise<TaskDetailPayload | null> => {
      if (!fullTaskId) return null;

      const p = perfilQuery.data?.profile ?? null;
      if (!p) return { tarea: null, notas: [], actividad: [], subtareas: [], shifts: [], perfil: null, parentTitle: null, chain: null, statuses: [], priorities: [] };

      const [taskRes, notesRes, activityRes, subRes, shiftsRes] = await Promise.all([
        apiFetch<{ tarea: Task | null }>(`/tareas/${fullTaskId}`).catch(() => null),
        apiFetch<{ notas: TaskNote[] }>(`/tareas/${fullTaskId}/notas`).catch(() => null),
        apiFetch<{ actividad: TaskActivityLog[] }>(`/tareas/${fullTaskId}/actividad`).catch(() => null),
        apiFetch<{ tareas: Task[] }>(`/tareas/${fullTaskId}/subtareas`).catch(() => null),
        apiFetch<{ shifts: Shift[] }>(`/horarios/shifts?organization_id=${encodeURIComponent(p.organization_id!)}`).catch(() => null),
      ]);

      const loadedTask = taskRes?.tarea ?? null;

      let chain: TaskDetailPayload['chain'] = null;
      let statuses: StatusDef[] = [];
      let priorities: PriorityDef[] = [];
      if (loadedTask?.list_id) {
        const list = arbolActual.lists.find((l) => l.id === loadedTask.list_id) ?? null;
        if (list) {
          statuses = resolveStatuses(list.statuses);
          priorities = resolvePriorities(list.priorities);
          let folder: { id: string; name: string; workspace_id: string } | null = null;
          if (list.folder_id) {
            const f = arbolActual.folders.find((x) => x.id === list.folder_id);
            if (f) folder = f;
          }
          const wsId = folder ? folder.workspace_id : list.workspace_id;
          const ws = arbolActual.workspaces.find((w) => w.id === wsId);
          if (ws) {
            chain = {
              workspace: ws.name,
              folder: folder?.name ?? null,
              list: list.name,
              listPath: `/proyectos/${entitySlug(ws, arbolActual.workspaces)}/${folder ? entitySlug(folder, arbolActual.folders) : 'raiz'}/${entitySlug(list, arbolActual.lists)}`,
            };
          }
        }
      }

      let parentTitle: string | null = null;
      if (loadedTask?.parent_task_id) {
        const res = await apiFetch<{ titulo: string }>(`/tareas/${loadedTask.parent_task_id}/padre`).catch(() => null);
        if (res?.titulo) parentTitle = res.titulo;
      }

      return {
        tarea: loadedTask,
        notas: notesRes?.notas ?? [],
        actividad: activityRes?.actividad ?? [],
        subtareas: subRes?.tareas ?? [],
        shifts: shiftsRes?.shifts ?? [],
        perfil: p,
        parentTitle,
        chain,
        statuses,
        priorities,
      };
    },
    enabled: !!fullTaskId && !!perfilQuery.data?.profile,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    const data = taskQuery.data;
    if (!data) return;
    setTask(data.tarea);
    setNotes(data.notas);
    setActivity(data.actividad);
    setSubTasks(data.subtareas);
    setProfile(data.perfil);
    setCollaborators(colaboradoresActuales);
    setShifts(data.shifts);
    setParentTitle(data.parentTitle);
    setChain(data.chain);
    setStatuses(data.statuses);
    setPriorities(data.priorities);
    setLoading(false);
  }, [taskQuery.data, colaboradoresActuales]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // URL canónica (slugs + prefijo corto). Solo se aplica si la ruta actual
  // sigue siendo la de ESTA tarea: durante una transición de ruta el árbol
  // anterior sigue montado, y un replace ciego secuestraba la navegación a
  // documento/mapa/formulario/todo (la vista rebotaba al detalle).
  const canonicalAplicadoRef = useRef<string | null>(null);
  useEffect(() => {
    if (enModal || !chain || !fullTaskId) return;
    const segs = pathname.split('/').filter(Boolean);
    const paramTarea = segs[0] === 'proyectos' && segs[4] === 'tarea' ? segs[5] : null;
    if (!paramTarea) return;
    if (!fullTaskId.replace(/-/g, '').startsWith(paramTarea.replace(/-/g, ''))) return;
    if (canonicalAplicadoRef.current === fullTaskId) return;
    canonicalAplicadoRef.current = fullTaskId;
    const canonical = `${chain.listPath}/tarea/${shortUid(fullTaskId)}`;
    if (pathname !== canonical) navigate({ to: canonical, replace: true });
  }, [enModal, chain, fullTaskId, pathname, navigate]);

  const refetchTarea = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['tarea', 'detalle', fullTaskId] });
  }, [queryClient, fullTaskId]);

  // Realtime: aplica el evento a la caché (la vista cambia al instante).
  // RLS aplica: solo llegan eventos de filas visibles.
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aplicarEventoDetalle = useCallback(
    (payload: unknown) => {
      const refetchDiferido = () => {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(refetchTarea, 300);
      };
      const evt = leerEvento<Record<string, unknown>>(payload);
      if (!evt) {
        refetchDiferido();
        return;
      }
      let aplicado = false;
      let revalidarFondo = false;
      parchearQuery<TaskDetailPayload>(queryClient, ['tarea', 'detalle', fullTaskId], (data) => {
        if (evt.table === 'tasks') {
          if (evt.eventType === 'DELETE') {
            if (evt.old?.id !== data.tarea?.id) return data;
            aplicado = true;
            return { ...data, tarea: null };
          }
          const nuevo = evt.new as unknown as Task;
          if (!nuevo.id || nuevo.id !== data.tarea?.id || !data.tarea) return data;
          aplicado = true;
          return {
            ...data,
            tarea: {
              ...data.tarea,
              ...nuevo,
              assigned_profile: nuevo.assigned_profile ?? data.tarea.assigned_profile,
              created_profile: nuevo.created_profile ?? data.tarea.created_profile,
              shift: nuevo.shift ?? data.tarea.shift,
            },
          };
        }
        if (evt.table === 'task_notes') {
          const r = aplicarEventoLista<TaskNote>(data.notas, evt);
          if (!r.aplicado || !r.lista) return data;
          aplicado = true;
          if (evt.eventType === 'INSERT') revalidarFondo = true;
          return { ...data, notas: r.lista };
        }
        if (evt.table === 'task_activity_log') {
          const r = aplicarEventoLista<TaskActivityLog>(data.actividad, evt);
          if (!r.aplicado || !r.lista) return data;
          aplicado = true;
          if (evt.eventType === 'INSERT') revalidarFondo = true;
          return { ...data, actividad: r.lista };
        }
        return data;
      });
      // Los INSERT no traen los embeds de la API (author/user): revalida de
      // fondo sin bloquear la pintura.
      if (revalidarFondo) refetchTarea();
      if (!aplicado) refetchDiferido();
    },
    [queryClient, fullTaskId, refetchTarea]
  );

  useEffect(() => {
    if (!fullTaskId) return;
    const channel = canalRealtime(`task-detail-${fullTaskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `id=eq.${fullTaskId}` },
        aplicarEventoDetalle
      )
      // Los DELETE no son filtrables: listeners sin filtro resueltos por id.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, aplicarEventoDetalle)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_notes', filter: `task_id=eq.${fullTaskId}` },
        aplicarEventoDetalle
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'task_notes' }, aplicarEventoDetalle)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_activity_log', filter: `task_id=eq.${fullTaskId}` },
        aplicarEventoDetalle
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'task_activity_log' },
        aplicarEventoDetalle
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      removerCanal(channel);
    };
  }, [fullTaskId, aplicarEventoDetalle]);

  const updateField = async (field: string, value: string | null) => {
    if (!canEdit) return;
    try {
      await api.patch(`/tareas/${fullTaskId ?? taskId}`, { [field]: value || null });
    } catch (e) {
      toast.error(`No se pudo guardar: ${e instanceof Error ? e.message : 'error'}`);
      return;
    }
    setTask((prev) => prev ? { ...prev, [field]: value } : null);
    toast.success('Actualizado');
    refetchTarea();
    onChanged?.();
  };

  const sendNote = async () => {
    if (!canEdit || !newNote.trim() || !profile) return;
    setSending(true);
    try {
      const res = await api.post<{ nota: TaskNote }>(`/tareas/${fullTaskId ?? taskId}/notas`, {
        author_id: profile.id,
        content: newNote,
      });
      setNotes((prev) => [...prev, res.nota]);
      setNewNote('');
      onChanged?.();
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      }, 0);
    } catch (e) {
      toast.error(`No se pudo enviar el comentario: ${e instanceof Error ? e.message : 'error'}`);
    }
    setSending(false);
  };

  const deleteTask = async () => {
    if (!canEdit) return;
    setDeleting(true);
    try {
      await api.delete(`/tareas/${fullTaskId ?? taskId}`);
    } catch (e) {
      toast.error(`No se pudo eliminar la tarea: ${e instanceof Error ? e.message : 'error'}`);
      setDeleting(false);
      setDeleteOpen(false);
      return;
    }
    setDeleting(false);
    setDeleteOpen(false);
    toast.success('Tarea eliminada');
    onChanged?.();
    if (enModal) {
      onDeleted?.();
      return;
    }
    window.location.href = '/proyectos';
  };

  const inviteToList = async () => {
    if (!task?.list_id) return;
    setInviting(true);
    try {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const res = await createInvitation({
        role: 'collaborator',
        expiresAt,
        entityType: 'list',
        entityId: task.list_id,
        permission: 'write',
        inherit: false,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      const link = res.link || `${window.location.origin}/invite/${res.token}`;
      const copiado = await copiarTexto(link);
      if (copiado) {
        toast.success('Link copiado — acceso aislado a la lista de esta tarea');
      } else {
        toast.success('Invitación creada', { description: link, duration: 12000 });
      }
    } catch {
      toast.error('No se pudo generar la invitación');
    } finally {
      setInviting(false);
    }
  };

  const formatTimestamp = (d: Date) => {
    const hora = formatHoraDeFecha(d);
    if (isToday(d)) return `hoy ${hora}`;
    if (isYesterday(d)) return `ayer ${hora}`;
    return `${format(d, "d MMM", { locale: es })} ${hora}`;
  };

  const activityIcon = (action: string) => {
    switch (action) {
      case 'created': return <Circle className="size-3 text-muted-foreground" />;
      case 'status_changed': return <Flag className="size-3 text-muted-foreground" />;
      case 'assigned': return <User className="size-3 text-muted-foreground" />;
      case 'priority_changed': return <Flag className="size-3 text-muted-foreground" />;
      case 'due_date_changed': return <Calendar className="size-3 text-muted-foreground" />;
      case 'hours_changed': return <Clock className="size-3 text-muted-foreground" />;
      case 'title_changed': return <Hash className="size-3 text-muted-foreground" />;
      default: return <Circle className="size-3 text-muted-foreground" />;
    }
  };

  const activityLabel = (log: TaskActivityLog): string => {
    const who = log.user?.full_name || 'Sistema';
    switch (log.action) {
      case 'created': return `${who} creó la tarea`;
      case 'status_changed': return `${who} cambió estado de "${statusLabel(statuses, log.old_value || '') || log.old_value}" a "${statusLabel(statuses, log.new_value || '') || log.new_value}"`;
      case 'assigned': return log.new_value ? `${who} asignó la tarea` : `${who} desasignó la tarea`;
      case 'priority_changed': return `${who} cambió prioridad de "${log.old_value}" a "${log.new_value}"`;
      case 'due_date_changed': return `${who} cambió fecha de "${log.old_value || 'sin fecha'}" a "${log.new_value || 'sin fecha'}"`;
      case 'hours_changed': return `${who} cambió horas de "${log.old_value || '0'}" a "${log.new_value || '0'}"`;
      case 'title_changed': return `${who} renombró de "${log.old_value}" a "${log.new_value}"`;
      default: return `${who} actualizó la tarea`;
    }
  };

  const initials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const taskLink = (id: string) => (chain ? `${chain.listPath}/tarea/${shortUid(id)}` : `/proyectos/${shortUid(id)}`);

  if (loading) {
    return <EsqueletoEntidad variante="detalle" />;
  }

  if (!task) {
    return (
      <EstadoEntidad
        icono={SquareCheckBig}
        titulo="Tarea no encontrada"
        accion={
          onClose
            ? { label: 'Cerrar', onClick: onClose }
            : { label: 'Volver a Proyectos', onClick: () => navigate({ to: '/proyectos' }) }
        }
      />
    );
  }

  const ruta = chain
    ? [
        { etiqueta: chain.workspace, href: chain.listPath },
        ...(chain.folder ? [{ etiqueta: chain.folder, href: chain.listPath }] : []),
        { etiqueta: chain.list, href: chain.listPath },
        ...(task.parent_task_id
          ? [{ etiqueta: parentTitle || '...', href: taskLink(task.parent_task_id) }]
          : []),
      ]
    : undefined;

  return (
    <EntidadPagina>
      <CabeceraEntidad
        tipo="tarea"
        ruta={ruta}
        titulo={
          <TituloEditableEntidad
            valor={task.title}
            onCommit={(v) => updateField('title', v)}
            disabled={!canEdit}
            placeholder="Título de la tarea"
          />
        }
        acciones={
          <>
            {task.list_id && esAdminActual && (
              <AccionEntidad
                icono={inviting ? undefined : UserPlus}
                onClick={inviteToList}
                disabled={inviting}
                title="Invitar a un colaborador a la lista de esta tarea (acceso aislado)"
              >
                {inviting && <Loader2 className="size-3.5 animate-spin" />}
                Invitar
              </AccionEntidad>
            )}
            {canEdit && (
              <AccionEntidad
                icono={Trash2}
                onClick={() => setDeleteOpen(true)}
                title="Eliminar tarea"
                className="text-destructive hover:text-destructive"
              >
                Eliminar
              </AccionEntidad>
            )}
          </>
        }
      />

      <PanelEntidad contenidoClassName="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex w-36 flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Estado</label>
          <Select defaultValue={task.status} onValueChange={(v) => updateField('status', v)} disabled={!canEdit}>
            <SelectTrigger className="h-8 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: statuses.find((s) => s.key === task.status)?.color ?? 'var(--muted-foreground)' }}
                  aria-hidden
                />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (<SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-32 flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Prioridad</label>
          <Select defaultValue={task.priority} onValueChange={(v) => updateField('priority', v)} disabled={!canEdit}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {priorities.map((p) => (<SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-44 flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Asignado</label>
          <Select
            defaultValue={task.assigned_to || ''}
            onValueChange={(v) => {
              if (v === '') {
                updateField('assigned_to', null);
                return;
              }
              const assignee = collaborators.find((c) => c.id === v);
              if (!assignee) {
                updateField('assigned_to', v);
                return;
              }
              openAssignAccess(assignee, task.list_id, (grants) => {
                updateField('assigned_to', v);
                void saveGrants(v, grants);
              });
            }}
            disabled={!canEdit}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Sin asignar</SelectItem>
              {collaborators.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-5"><AvatarFallback className="text-xs">{initials(c.full_name)}</AvatarFallback></Avatar>
                    {c.full_name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-36 flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Fecha límite</label>
          <Input
            type="date"
            defaultValue={task.due_date || ''}
            onBlur={(e) => updateField('due_date', e.target.value || null)}
            readOnly={!canEdit}
            className="h-8 text-xs"
          />
        </div>

        <div className="flex w-24 flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Horas est.</label>
          <Input
            type="number"
            defaultValue={task.estimated_hours || ''}
            onBlur={(e) => updateField('estimated_hours', e.target.value || null)}
            readOnly={!canEdit}
            className="h-8 text-xs"
            step="0.5"
          />
        </div>

        <div className="flex w-36 flex-col gap-1.5">
          <label className="text-xs text-muted-foreground">Turno</label>
          <Select defaultValue={task.shift_id || ''} onValueChange={(v) => updateField('shift_id', v || null)} disabled={!canEdit}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Sin turno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Sin turno</SelectItem>
              {shifts.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </PanelEntidad>

      <div className="@container">
        <div className="grid gap-6 @4xl:grid-cols-3">
          {/* Left: Descripción + Sub-tareas */}
          <div className="@4xl:col-span-1 space-y-4">
            <PanelEntidad>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Descripción</label>
                <Textarea
                  defaultValue={task.description || ''}
                  onBlur={(e) => updateField('description', e.target.value || null)}
                  readOnly={!canEdit}
                  placeholder="Sin descripción. Click para agregar..."
                  className="text-xs border-0 bg-transparent focus-visible:ring-1 resize-none min-h-[44px] px-1 -mx-1"
                  rows={2}
                />
              </div>
            </PanelEntidad>

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={task ? `Eliminar "${task.title}"` : 'Eliminar tarea'}
            description="La tarea y todas sus sub-tareas se eliminarán definitivamente. Esta acción no se puede deshacer."
            confirmLabel="Eliminar"
            loading={deleting}
            onConfirm={() => void deleteTask()}
          />

          {/* Sub-tasks */}
          {subTasks.length > 0 && (
            <PanelEntidad
              titulo={`Sub-tareas (${subTasks.length})`}
              contenidoClassName="space-y-1"
            >
                {subTasks.map((st) => {
                  const stDef = statuses.find((s) => s.key === st.status);
                  return (
                    <Link
                      key={st.id}
                      href={taskLink(st.id)}
                      onClick={(e) => {
                        if (!onOpenTask) return;
                        e.preventDefault();
                        onOpenTask(st.id);
                      }}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      <div
                        className="size-2 rounded-full"
                        style={{ backgroundColor: stDef?.color ?? 'var(--muted-foreground)' }}
                      />
                      <span className="flex-1 truncate">{st.title}</span>
                      <span className="text-muted-foreground text-xs">
                        {stDef?.label ?? st.status}
                      </span>
                    </Link>
                  );
                })}
              </PanelEntidad>
          )}
        </div>

        {/* Right: Notes / Timeline */}
        <div className="@4xl:col-span-2">
          <Card className="flex flex-col h-[50vh] lg:h-[65vh]">
            <CardHeader className="border-b pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {tab === 'notes' ? 'Comentarios' : 'Actividad'}
                </CardTitle>
                <div className="flex rounded-md border p-0.5">
                  <button
                    onClick={() => setTab('notes')}
                    className={`px-3 py-1 text-xs rounded-sm transition-colors ${tab === 'notes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Comentarios
                  </button>
                  <button
                    onClick={() => setTab('timeline')}
                    className={`px-3 py-1 text-xs rounded-sm transition-colors ${tab === 'timeline' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Actividad
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0">
              <ScrollArea className="flex-1 p-4">
                {tab === 'notes' && (
                  <>
                    {notes.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <MessageSquare className="size-8 text-muted-foreground/40 mb-2" aria-hidden />
                        <p className="text-sm font-medium">Sin comentarios</p>
                        <p className="text-xs text-muted-foreground">Sé el primero en comentar.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {notes.map((note) => (
                          <div key={note.id} className="flex gap-3">
                            <Avatar className="size-7 shrink-0">
                              <AvatarFallback className="text-xs">
                                {initials(note.author?.full_name || 'NN')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-medium">{note.author?.full_name}</span>
                                <span className="text-muted-foreground text-xs">
                                  {formatTimestamp(new Date(note.created_at))}
                                </span>
                              </div>
                              <p className="text-sm mt-0.5 break-words">{note.content}</p>
                            </div>
                          </div>
                        ))}
                        <div ref={bottomRef} />
                      </div>
                    )}
                  </>
                )}

                {tab === 'timeline' && (
                  <div className="relative pl-6">
                    <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                    <div className="space-y-3">
                      {activity.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8 text-xs">Sin actividad registrada</p>
                      ) : (
                        activity.map((log) => (
                          <div key={log.id} className="relative flex gap-3">
                            <div className="absolute left-[-17px] top-1 bg-background rounded-full p-0.5 border">
                              {activityIcon(log.action)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs">{activityLabel(log)}</p>
                              <span className="text-muted-foreground text-xs">
                                {formatTimestamp(new Date(log.created_at))}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </ScrollArea>

              {tab === 'notes' && (
                <div className="border-t p-3">
                  <form onSubmit={(e) => { e.preventDefault(); sendNote(); }} className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder={canEdit ? 'Escribe un comentario...' : 'Solo lectura'}
                      readOnly={!canEdit}
                      className="flex-1 text-sm"
                    />
                    <Button type="submit" size="icon" disabled={!canEdit || sending || !newNote.trim()}>
                      {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    </Button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
      {assignAccessDialog}
    </EntidadPagina>
  );
}

