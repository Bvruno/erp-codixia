import { createFileRoute, redirect } from '@tanstack/react-router';
import { sesionActual } from '@/lib/auth/sesion';
import { API_URL } from '@/lib/api/base';
import { rutaVistaPorDefecto } from '@/lib/vista-inicial';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const sesion = await sesionActual();
    if (!sesion) {
      throw redirect({ to: '/login' });
    }
    const res = await fetch(`${API_URL}/auth/estado`, {
      headers: { Authorization: `Bearer ${sesion.accessToken}` },
    });
    if (!res.ok) {
      throw redirect({ to: '/login' });
    }
    const estado = await res.json().catch(() => null);
    throw redirect({
      to: rutaVistaPorDefecto(estado?.perfil?.preferences?.default_view),
    });
  },
});
