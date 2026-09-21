import { useState } from 'react';
import { toast } from 'sonner';
import { api, apiFetch } from '@/lib/api/cliente';
import { queryClient } from '@/lib/query-client';
import { listDescendants } from '@/lib/access';
import type { Profile, EntityPermission, EntityType, EntityGrant } from '@/types';
import type { ScopeSelection } from '@/components/colaboradores/entity-scope-picker';
import type { ArbolColaboradores } from './presentacion';

// Gestión de accesos específicos de un colaborador (grants por entidad).

export type GrantsColaboradores = ReturnType<typeof useGrantsColaboradores>;

export function useGrantsColaboradores({
  tree,
  setBusy,
}: {
  tree: ArbolColaboradores;
  setBusy: (v: string | null) => void;
}) {
  const [accessMember, setAccessMember] = useState<Profile | null>(null);
  const [accessGrants, setAccessGrants] = useState<EntityGrant[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [agregandoAcceso, setAgregandoAcceso] = useState(false);
  const [accessAdd, setAccessAdd] = useState<{
    type: EntityType;
    selection: ScopeSelection;
    permission: EntityPermission;
    inherit: boolean;
  }>({ type: 'workspace', selection: null, permission: 'read', inherit: true });
  const [propagateTarget, setPropagateTarget] = useState<EntityGrant | null>(null);

  const openAccessDialog = async (member: Profile) => {
    setAccessMember(member);
    setAccessLoading(true);
    setAccessAdd({ type: 'workspace', selection: null, permission: 'read', inherit: true });
    // fetchQuery comparte la caché con el detalle del miembro: si la copia
    // es fresca (<60s) no hay petición de red.
    const res = await queryClient
      .fetchQuery({
        queryKey: ['entidades', 'grants', member.id],
        queryFn: () =>
          apiFetch<{ grants: EntityGrant[] }>(
            `/entidades/grants?profile_id=${encodeURIComponent(member.id)}`
          ),
        staleTime: 60_000,
      })
      .catch(() => null);
    setAccessGrants(res?.grants ?? []);
    setAccessLoading(false);
  };

  const invalidarAccesos = () => {
    void queryClient.invalidateQueries({ queryKey: ['entidades', 'grants'] });
  };

  const saveGrant = async (
    memberId: string,
    type: EntityType,
    id: string,
    permission: EntityPermission,
    inherit: boolean
  ) => {
    try {
      await api.post('/colaboradores/grants', {
        entity_type: type,
        entity_id: id,
        profile_id: memberId,
        permission,
        inherit,
      });
      toast.success('Acceso actualizado');
      invalidarAccesos();
      if (accessMember) openAccessDialog(accessMember);
    } catch {
      toast.error('No se pudo actualizar el acceso');
    }
  };

  const removeGrant = async (memberId: string, type: EntityType, id: string) => {
    try {
      await api.delete('/colaboradores/grants', {
        body: JSON.stringify({ entity_type: type, entity_id: id, profile_id: memberId }),
        headers: { 'Content-Type': 'application/json' },
      });
      toast.success('Acceso eliminado');
      invalidarAccesos();
      if (accessMember) openAccessDialog(accessMember);
    } catch {
      toast.error('No se pudo eliminar el acceso');
    }
  };

  const addGrant = async () => {
    if (!accessMember || agregandoAcceso) return;
    const sel = accessAdd.selection;
    if (!sel) {
      toast.error('Selecciona una entidad en el árbol');
      return;
    }
    setAgregandoAcceso(true);
    try {
      await saveGrant(accessMember.id, sel.type, sel.id, accessAdd.permission, accessAdd.inherit);
    } finally {
      setAgregandoAcceso(false);
    }
  };

  const propagateGrant = async () => {
    const grant = propagateTarget;
    if (!grant || !accessMember) return;

    const descendants = listDescendants(tree, grant.entity_type, grant.entity_id);
    if (descendants.length === 0) {
      toast.info('Esta entidad no tiene contenido interno');
      setPropagateTarget(null);
      return;
    }

    setBusy('propagate');
    try {
      await api.post('/entidades/grants/propagar', {
        grants: descendants.map((d) => ({
          entity_type: d.type,
          entity_id: d.id,
          profile_id: grant.profile_id,
          permission: grant.permission,
          inherit: grant.inherit,
        })),
      });
      toast.success(`Acceso propagado a ${descendants.length} elemento(s) del contenido`);
      invalidarAccesos();
    } catch (e) {
      toast.error('Error al propagar el acceso: ' + (e instanceof Error ? e.message : 'error'));
    } finally {
      setBusy(null);
      setPropagateTarget(null);
      if (accessMember) openAccessDialog(accessMember);
    }
  };

  return {
    accessMember,
    setAccessMember,
    accessGrants,
    accessLoading,
    agregandoAcceso,
    accessAdd,
    setAccessAdd,
    propagateTarget,
    setPropagateTarget,
    openAccessDialog,
    saveGrant,
    removeGrant,
    addGrant,
    propagateGrant,
  };
}
