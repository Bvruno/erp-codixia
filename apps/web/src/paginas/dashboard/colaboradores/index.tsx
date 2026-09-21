'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { useRouter } from 'next/navigation';
import { sesionActual } from '@/lib/auth/sesion';
import { api, apiFetch } from '@/lib/api/cliente';
import { TTL_CACHE } from '@/lib/cache-claves';
import { aplicarEventoLista, leerEvento, parchearQuery } from '@/lib/realtime-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Link2,
  Clock,
  Ban,
  CheckCircle,
  Search,
  Users,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  EntityScopePicker,
  type ScopeSelection,
} from '@/components/colaboradores/entity-scope-picker';
import { PermissionPicker } from '@/components/colaboradores/permission-picker';
import { MemberDetailCard, type GrantSummary, type OrgLimits } from '@/components/colaboradores/member-detail-card';
import { PageHeader } from '@/components/layout/page-header';
import type {
  Profile,
  Invitation,
  Schedule,
  Shift,
  EntityPermission,
  EntityType,
  EntityGrant,
  Workspace,
  WorkspaceFolder,
  TaskList,
  TaskDocument,
  MindMap,
  Todo,
  Formulario,
} from '@/types';
import {
  ArbolColaboradoresPlaceholder,
  entityName,
  grantPath,
  effectiveStatus,
  PERMISSION_LABELS,
  SCOPE_LABELS,
  type ArbolColaboradores,
} from './presentacion';
import { useGrantsColaboradores } from './use-grants';
import { useAccionesColaboradores } from './use-acciones';
import { TablaMiembros } from './tabla-miembros';
import { TablaInvitaciones } from './tabla-invitaciones';
import { DialogoAccesos } from './dialogo-accesos';

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel?: string;
  action: () => Promise<void> | void;
}

type ColaboradoresData = {
  profile: Profile;
  collaborators: Profile[];
  owner_id: string | null;
  invitations: Invitation[];
  grant_counts: Record<string, number>;
  schedules: Schedule[];
  shifts: Shift[];
  org_settings: OrgLimits | null;
};

export default function ColaboradoresPage() {
const router = useRouter();
  const [collaborators, setCollaborators] = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [me, setMe] = useState<{
    id: string;
    organization_id: string;
    role: string;
    blocked: boolean;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [expiryHours, setExpiryHours] = useState('24');
  const [inviteRole, setInviteRole] = useState<'admin' | 'collaborator'>('collaborator');
  const [inviteScoped, setInviteScoped] = useState(false);
  const [inviteScopeType, setInviteScopeType] = useState<EntityType>('workspace');
  const [inviteScope, setInviteScope] = useState<ScopeSelection>(null);
  const [invitePermission, setInvitePermission] = useState<EntityPermission>('read');
  const [inviteInherit, setInviteInherit] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [orgLimits, setOrgLimits] = useState<OrgLimits | null>(null);
  const [memberGrantCounts, setMemberGrantCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveSelectedId = selectedId ?? (dismissed ? null : collaborators[0]?.id ?? null);

  const queryClient = useQueryClient();
  const arbolQuery = useQuery({
    queryKey: ['entidades', 'arbol'],
    queryFn: async (): Promise<ArbolColaboradores> => {
  const res = await apiFetch<{
    workspaces: Workspace[];
    folders: WorkspaceFolder[];
    lists: TaskList[];
    documents: TaskDocument[];
    mindmaps: MindMap[];
    todos: Todo[];
    formularios: Formulario[];
  }>('/entidades/arbol');
      return {
        workspaces: res.workspaces,
        folders: res.folders,
        lists: res.lists,
        documents: res.documents,
        mindmaps: res.mindmaps,
        todos: res.todos,
        formularios: res.formularios,
      };
    },
    staleTime: TTL_CACHE.estructura,
    refetchOnWindowFocus: false,
  });
  const tree = arbolQuery.data ?? ArbolColaboradoresPlaceholder;
  const colaboradoresQuery = useQuery({
    queryKey: ['colaboradores', 'datos'],
    queryFn: async (): Promise<ColaboradoresData> => {
      const sesion = await sesionActual();
      if (!sesion) throw new Error('Sesión no encontrada. Inicia sesión de nuevo.');

      const res = await apiFetch<{
        profile: Profile;
        collaborators: Profile[];
        owner_id: string | null;
        invitations: Invitation[];
        grant_counts: Record<string, number>;
        schedules: Schedule[];
        shifts: Shift[];
        org_settings: OrgLimits | null;
      }>('/colaboradores/datos');
      return res;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    const res = colaboradoresQuery.data;
    if (!res) return;

    if (res.profile.role !== 'admin') {
      router.replace('/calendario');
      return;
    }
    setMe(res.profile);
    setOrgId(res.profile.organization_id);
    setMemberGrantCounts(res.grant_counts);
    setCollaborators(res.collaborators);
    setOwnerId(res.owner_id);
    setSchedules(res.schedules);
    setShifts(res.shifts);
    setOrgLimits(res.org_settings);

    const now = new Date();
    const invites = res.invitations;
    const toExpire = invites.filter(
      (i) => i.status === 'pending' && new Date(i.expires_at) < now
    );
    if (toExpire.length > 0) {
      void Promise.all(
        toExpire.map((i) =>
          api.post(`/colaboradores/invitaciones/${i.id}/estado`, { status: 'expired' }).catch(() => undefined)
        )
      ).then(() => {
        setInvitations(
          invites.map((i) =>
            toExpire.some((e) => e.id === i.id) ? { ...i, status: 'expired' } : i
          )
        );
      });
    } else {
      setInvitations(invites);
    }
    setError(null);
    setLoading(false);
  }, [colaboradoresQuery.data, router]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect -- Sync de error de query */
  useEffect(() => {
    if (!colaboradoresQuery.isError) return;
    setError('No se pudieron cargar los colaboradores.');
    setLoading(false);
  }, [colaboradoresQuery.isError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const refetchColaboradores = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['colaboradores', 'datos'] });
  }, [queryClient]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const grantsDetalleQuery = useQuery({
    queryKey: ['entidades', 'grants', effectiveSelectedId],
    queryFn: () =>
      apiFetch<{ grants: EntityGrant[] }>(
        `/entidades/grants?profile_id=${encodeURIComponent(effectiveSelectedId!)}`
      ),
    enabled: !!effectiveSelectedId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const detailGrants = grantsDetalleQuery.data?.grants ?? [];
  const detailGrantsLoading = !!effectiveSelectedId && grantsDetalleQuery.isPending;

  // Aplica eventos a la caché (la tabla cambia al instante); los eventos
  // de visibilidad afectan al árbol y caen a invalidación.
  const aplicarEventoColaboradores = useCallback(
    (payload: unknown) => {
      const evt = leerEvento<Record<string, unknown>>(payload);
      if (!evt) {
        refetchColaboradores();
        return;
      }
      if (evt.table === 'entity_visibility') {
        void queryClient.invalidateQueries({ queryKey: ['entidades', 'arbol'] });
        refetchColaboradores();
        return;
      }
      let aplicado = false;
      parchearQuery<ColaboradoresData>(queryClient, ['colaboradores', 'datos'], (data) => {
        if (evt.table === 'profiles') {
          const r = aplicarEventoLista<Profile>(data.collaborators, evt);
          if (!r.aplicado || !r.lista) return data;
          aplicado = true;
          return { ...data, collaborators: r.lista };
        }
        if (evt.table === 'invitations') {
          const r = aplicarEventoLista<Invitation>(data.invitations, evt);
          if (!r.aplicado || !r.lista) return data;
          aplicado = true;
          return { ...data, invitations: r.lista };
        }
        if (evt.table === 'schedules') {
          const r = aplicarEventoLista<Schedule>(data.schedules, evt);
          if (!r.aplicado || !r.lista) return data;
          aplicado = true;
          return { ...data, schedules: r.lista };
        }
        return data;
      });
      if (!aplicado) {
        if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = setTimeout(refetchColaboradores, 300);
      }
    },
    [queryClient, refetchColaboradores]
  );

  useEffect(() => {
    if (!orgId) return;

    const channel = canalRealtime(`colaboradores-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, aplicarEventoColaboradores)
      // Los DELETE no son filtrables: listener sin filtro resuelto por id.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, aplicarEventoColaboradores)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, aplicarEventoColaboradores)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'invitations' }, aplicarEventoColaboradores)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entity_visibility' }, aplicarEventoColaboradores)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'entity_visibility' }, aplicarEventoColaboradores)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, aplicarEventoColaboradores)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'schedules' }, aplicarEventoColaboradores)
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      removerCanal(channel);
    };
  }, [orgId, aplicarEventoColaboradores]);

  const resetInvitar = useCallback(() => {
    setShowCreateInvite(false);
    setInviteScoped(false);
    setInviteScope(null);
    setInvitePermission('read');
    setInviteInherit(true);
  }, []);

  const acciones = useAccionesColaboradores({
    setBusy,
    refetch: refetchColaboradores,
    invitar: {
      expiryHours,
      inviteRole,
      inviteScoped,
      inviteScope,
      invitePermission,
      inviteInherit,
    },
    resetInvitar,
  });

  const grants = useGrantsColaboradores({ tree, setBusy });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Colaboradores" />
        </div>
        <TableSkeleton rows={5} cols={4} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={Users}
        title="Sin acceso"
        description={error}
        action={{ label: 'Reintentar', onClick: () => refetchColaboradores() }}
      />
    );
  }

  const isOwnerSession = !!me && me.id === ownerId;

  const canManage = (c: Profile) => {
    if (!me) return false;
    if (c.id === me.id) return false;
    if (c.id === ownerId) return false;
    if (c.role === 'admin' && !isOwnerSession) return false;
    return true;
  };

  const filteredCollaborators = collaborators.filter((c) =>
    c.full_name.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const selectedMember = effectiveSelectedId
    ? collaborators.find((c) => c.id === effectiveSelectedId) ?? null
    : null;

  const grantRows: GrantSummary[] = detailGrants.map((g) => ({
    typeLabel: SCOPE_LABELS[g.entity_type],
    name: entityName(tree, g.entity_type, g.entity_id),
    path: grantPath(tree, g.entity_type, g.entity_id),
    permission: g.permission,
    inherit: g.inherit,
  }));

  const activeCount = collaborators.filter((c) => !c.blocked).length;
  const blockedCount = collaborators.length - activeCount;
  const pendingInvites = invitations.filter((i) => effectiveStatus(i) === 'pending').length;

  const stats = [
    { label: 'Miembros', value: collaborators.length, icon: Users },
    { label: 'Activos', value: activeCount, icon: CheckCircle },
    { label: 'Bloqueados', value: blockedCount, icon: Ban },
    { label: 'Invitaciones pendientes', value: pendingInvites, icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Colaboradores" />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
            <Input
              placeholder="Buscar miembro..."
              className="w-48 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar miembro"
            />
          </div>
          <Dialog open={showCreateInvite} onOpenChange={setShowCreateInvite}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  void arbolQuery.refetch();
                }}
              >
                <Plus className="size-4" />
                Invitar Colaborador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Link de Invitación</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Rol asignado</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as 'admin' | 'collaborator')}
                  >
                    <SelectTrigger>
                      <ShieldCheck className="size-4 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="collaborator">Colaborador</SelectItem>
                      {isOwnerSession && <SelectItem value="admin">Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tiempo de expiración</Label>
                  <Select value={expiryHours} onValueChange={setExpiryHours}>
                    <SelectTrigger>
                      <Clock className="size-4 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hora</SelectItem>
                      <SelectItem value="6">6 horas</SelectItem>
                      <SelectItem value="24">24 horas</SelectItem>
                      <SelectItem value="48">48 horas</SelectItem>
                      <SelectItem value="168">7 días</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {inviteRole === 'collaborator' && (
                  <>
                    <div className="space-y-2">
                      <Label>Alcance del acceso</Label>
                      <Select
                        value={inviteScoped ? 'specific' : 'org'}
                        onValueChange={(v) => {
                          setInviteScoped(v === 'specific');
                          setInviteScope(null);
                        }}
                      >
                        <SelectTrigger>
                          <Layers className="size-4 text-muted-foreground" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="org">Toda la organización</SelectItem>
                          <SelectItem value="specific">Acceso específico</SelectItem>
                        </SelectContent>
                      </Select>
                      {!inviteScoped && (
                        <p className="text-muted-foreground text-xs">
                          Ve el contenido público de la organización.
                        </p>
                      )}
                    </div>

                    {inviteScoped && (
                      <>
                        <EntityScopePicker
                          tree={tree}
                          type={inviteScopeType}
                          onTypeChange={setInviteScopeType}
                          value={inviteScope}
                          onChange={setInviteScope}
                        />
                        <PermissionPicker
                          value={invitePermission}
                          onChange={setInvitePermission}
                          inherit={inviteInherit}
                          onInheritChange={setInviteInherit}
                        />
                      </>
                    )}
                  </>
                )}
                <Button onClick={acciones.createInviteLink} className="w-full" disabled={busy === 'invite'}>
                  <Link2 className="size-4" />
                  {busy === 'invite' ? 'Generando...' : 'Generar y Copiar Link'}
                </Button>
                <p className="bg-amber-500/10 text-amber-400 text-xs rounded-md p-2">
                  Todo miembro debe tener un horario: asígnalo desde la columna
                  Horario tras aceptar la invitación. Sin horario no podrá
                  registrar horas ni recibir tareas.
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="bg-muted rounded-full p-2">
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{value}</p>
                <p className="text-muted-foreground text-xs mt-1">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TablaMiembros
          miembros={filteredCollaborators}
          totalMiembros={collaborators.length}
          seleccionadoId={effectiveSelectedId}
          ownerId={ownerId}
          meId={me?.id ?? null}
          grantCounts={memberGrantCounts}
          busy={busy}
          esOwnerSession={isOwnerSession}
          canManage={canManage}
          onSeleccionar={(id) => {
            setDismissed(false);
            setSelectedId(id);
          }}
          onCambiarRol={(id, rol) => acciones.changeRole(id, rol)}
          onAbrirAccesos={(c) => grants.openAccessDialog(c)}
          onPedirBloqueo={(c) =>
            setConfirm({
              title: c.blocked ? '¿Desbloquear usuario?' : '¿Bloquear usuario?',
              description: c.blocked
                ? 'El usuario podrá volver a acceder a la plataforma.'
                : 'El usuario no podrá iniciar sesión ni ver datos de la organización.',
              confirmLabel: c.blocked ? 'Desbloquear' : 'Bloquear',
              action: () => acciones.toggleBlock(c.id, c.blocked),
            })
          }
          onPedirEliminar={(c) =>
            setConfirm({
              title: '¿Eliminar miembro?',
              description: `Se eliminará la cuenta de ${c.full_name} y todos sus datos. Esta acción no se puede deshacer.`,
              confirmLabel: 'Eliminar',
              action: () => acciones.deleteMember(c.id),
            })
          }
        />

        <div className="min-w-0 lg:sticky lg:top-6">
          {selectedMember ? (
            <MemberDetailCard
              key={selectedMember.id}
              member={selectedMember}
              isOwner={selectedMember.id === ownerId}
              isSelf={!!me && selectedMember.id === me.id}
              canManage={canManage(selectedMember)}
              canAssignAdmin={isOwnerSession}
              orgId={orgId ?? ''}
              createdBy={me?.id ?? ''}
              ownerId={ownerId ?? ''}
              schedules={schedules}
              shifts={shifts}
              grants={grantRows}
              grantsLoading={detailGrantsLoading}
              orgLimits={orgLimits}
              onScheduleChange={() => refetchColaboradores()}
              onProfileChanged={() => refetchColaboradores()}
              onRoleChange={(role) => acciones.changeRole(selectedMember.id, role)}
              onManageAccess={() => grants.openAccessDialog(selectedMember)}
              onBlockRequest={() => {
                const m = selectedMember;
                setConfirm({
                  title: m.blocked ? '¿Desbloquear usuario?' : '¿Bloquear usuario?',
                  description: m.blocked
                    ? 'El usuario podrá volver a acceder a la plataforma.'
                    : 'El usuario no podrá iniciar sesión ni ver datos de la organización.',
                  confirmLabel: m.blocked ? 'Desbloquear' : 'Bloquear',
                  action: () => acciones.toggleBlock(m.id, m.blocked),
                });
              }}
              onDeleteRequest={() => {
                const m = selectedMember;
                setConfirm({
                  title: '¿Eliminar miembro?',
                  description: `Se eliminará la cuenta de ${m.full_name} y todos sus datos. Esta acción no se puede deshacer.`,
                  confirmLabel: 'Eliminar',
                  action: () => acciones.deleteMember(m.id),
                });
              }}
              onClose={() => {
                setDismissed(true);
                setSelectedId(null);
              }}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Users className="text-muted-foreground size-8" />
                <p className="text-muted-foreground text-sm">
                  Selecciona un colaborador de la lista para ver su detalle.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <TablaInvitaciones
        invitaciones={invitations}
        tree={tree}
        onPedirCancelar={(inv) =>
          setConfirm({
            title: '¿Cancelar invitación?',
            description: 'El link dejará de ser válido. Podrás generar uno nuevo cuando quieras.',
            confirmLabel: 'Cancelar invitación',
            action: () => acciones.cancelInvite(inv.id),
          })
        }
      />

      <DialogoAccesos tree={tree} grants={grants} />

      <ConfirmDialog
        open={!!grants.propagateTarget}
        onOpenChange={(open) => !open && grants.setPropagateTarget(null)}
        title="¿Propagar acceso al contenido?"
        description={
          grants.propagateTarget
            ? `Se creará acceso "${PERMISSION_LABELS[grants.propagateTarget.permission]}" en todo el contenido interno de "${entityName(tree, grants.propagateTarget.entity_type, grants.propagateTarget.entity_id)}" (subcarpetas, listas y documentos). Los accesos existentes en ese contenido se sobrescribirán.`
            : ''
        }
        confirmLabel="Propagar"
        loading={busy === 'propagate'}
        onConfirm={grants.propagateGrant}
      />

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.title || ''}
        description={confirm?.description || ''}
        confirmLabel={confirm?.confirmLabel}
        loading={busy !== null}
        onConfirm={async () => {
          setBusy('confirm');
          try {
            await confirm?.action();
          } finally {
            setBusy(null);
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
