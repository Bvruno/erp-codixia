import { toast } from 'sonner';
import { api } from '@/lib/api/cliente';
import { createInvitation } from '@/lib/auth/actions';
import type { EntityPermission } from '@/types';
import type { ScopeSelection } from '@/components/colaboradores/entity-scope-picker';

// Acciones de administración de miembros e invitaciones.

export function useAccionesColaboradores({
  setBusy,
  refetch,
  invitar,
  resetInvitar,
}: {
  setBusy: (v: string | null) => void;
  refetch: () => void;
  invitar: {
    expiryHours: string;
    inviteRole: 'admin' | 'collaborator';
    inviteScoped: boolean;
    inviteScope: ScopeSelection;
    invitePermission: EntityPermission;
    inviteInherit: boolean;
  };
  resetInvitar: () => void;
}) {
  const createInviteLink = async () => {
    const expiresAt = new Date(Date.now() + parseInt(invitar.expiryHours) * 3600000).toISOString();

    const entityType = invitar.inviteScoped && invitar.inviteScope ? invitar.inviteScope.type : null;
    const entityId = entityType ? invitar.inviteScope!.id : null;

    setBusy('invite');
    try {
      const res = await createInvitation({
        role: invitar.inviteRole,
        expiresAt,
        entityType,
        entityId,
        permission: entityType ? invitar.invitePermission : null,
        inherit: entityType ? invitar.inviteInherit : true,
      });

      if (res?.error) {
        toast.error(res.error);
        return;
      }

      const link = res.link || `${window.location.origin}/invite/${res.token}`;
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado al portapapeles');
      resetInvitar();
      refetch();
    } catch {
      toast.error('Error al generar la invitación');
    } finally {
      setBusy(null);
    }
  };

  const cancelInvite = async (inviteId: string) => {
    try {
      await api.post(`/colaboradores/invitaciones/${inviteId}/estado`, { status: 'cancelled' });
      toast.success('Invitación cancelada');
      refetch();
    } catch {
      toast.error('Error al cancelar la invitación');
    }
  };

  const toggleBlock = async (userId: string, blocked: boolean) => {
    try {
      await api.patch(`/miembros/${userId}`, { blocked: !blocked });
      toast.success(blocked ? 'Usuario desbloqueado' : 'Usuario bloqueado');
      refetch();
    } catch {
      toast.error('Error al actualizar el estado');
    }
  };

  const changeRole = async (userId: string, role: string) => {
    setBusy(`role-${userId}`);
    try {
      // Promoción a admin: restaura acceso general (admin bypasea RLS)
      const patch: Record<string, unknown> = { role };
      if (role === 'admin') patch.access_mode = 'org';
      await api.patch(`/miembros/${userId}`, patch);
      toast.success('Rol actualizado');
      refetch();
    } catch {
      toast.error('Error al actualizar el rol');
    } finally {
      setBusy(null);
    }
  };

  const deleteMember = async (userId: string) => {
    setBusy('delete');
    try {
      await api.delete(`/miembros/${userId}`);
      toast.success('Miembro eliminado');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setBusy(null);
    }
  };

  return { createInviteLink, cancelInvite, toggleBlock, changeRole, deleteMember };
}
