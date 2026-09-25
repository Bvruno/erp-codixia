import { useState } from 'react';
import { toast } from 'sonner';
import { api, apiFetch } from '@/lib/api/cliente';
import { queryClient } from '@/lib/query-client';
import type { Profile, EntityPermission, EntityType, EntityGrant } from '@/types';
import type { ScopeSelection } from '@/components/colaboradores/entity-scope-picker';

// Gestión de accesos específicos de un colaborador (grants por entidad).

export type GrantsColaboradores = ReturnType<typeof useGrantsColaboradores>;

export function useGrantsColaboradores() {
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

  return {
    accessMember,
    setAccessMember,
    accessGrants,
    accessLoading,
    agregandoAcceso,
    accessAdd,
    setAccessAdd,
    openAccessDialog,
    saveGrant,
    removeGrant,
    addGrant,
  };
}
