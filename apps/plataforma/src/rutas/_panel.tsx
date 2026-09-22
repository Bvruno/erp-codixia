import { createFileRoute, redirect } from '@tanstack/react-router';
import { PanelLayout } from '@/components/layout/panel-layout';
import { sesionActual } from '@/lib/auth/sesion';
import { logout } from '@/lib/auth/actions';
import { API_URL } from '@/lib/api/base';

export const Route = createFileRoute('/_panel')({
  beforeLoad: async () => {
    const sesion = await sesionActual();
    if (!sesion) throw redirect({ to: '/login' });

    const res = await fetch(`${API_URL}/auth/estado`, {
      headers: { Authorization: `Bearer ${sesion.accessToken}` },
    });
    if (!res.ok) {
      await logout();
      throw redirect({ to: '/login' });
    }

    const estado = (await res.json()) as { email?: string; es_plataforma?: boolean };
    if (!estado.es_plataforma) {
      await logout();
      throw redirect({ to: '/login' });
    }

    return { usuario: { email: estado.email ?? null } };
  },
  component: Panel,
});

function Panel() {
  const { usuario } = Route.useRouteContext();
  return <PanelLayout email={usuario.email} />;
}
