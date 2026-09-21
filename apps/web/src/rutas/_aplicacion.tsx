import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { sesionActual } from '@/lib/auth/sesion';
import { logout } from '@/lib/auth/actions';
import { API_URL } from '@/lib/api/base';
import { hidratarCacheNavegador } from '@/lib/query-client';
import DashboardLayout from '@/components/layout/dashboard-layout';

export const Route = createFileRoute('/_aplicacion')({
  beforeLoad: async () => {
    const sesion = await sesionActual();
    if (!sesion) {
      throw redirect({ to: '/login' });
    }
  },
  loader: async () => {
    const sesion = await sesionActual();
    if (!sesion) {
      throw redirect({ to: '/login' });
    }
    const res = await fetch(`${API_URL}/auth/estado`, {
      headers: { Authorization: `Bearer ${sesion.accessToken}` },
    });
    if (!res.ok) {
      await logout();
      throw redirect({ to: '/login' });
    }
    const estado = await res.json();
    if (estado.perfil?.onboarding_pending) {
      throw redirect({ to: '/onboarding' });
    }
    // Deja la caché del navegador lista antes de montar las páginas: si la
    // copia en IndexedDB está fresca, evita el GET de entrada (perfil,
    // calendario) y pinta al instante.
    await hidratarCacheNavegador({
      userId: estado.perfil?.id,
      orgId: estado.perfil?.organization_id,
    });
    return {
      usuario: {
        email: estado.email,
        full_name: estado.perfil?.full_name ?? null,
        role: estado.perfil?.role,
        is_owner: estado.perfil?.is_owner ?? false,
        preferences: estado.perfil?.preferences ?? null,
      },
    };
  },
  component: Aplicacion,
});

function Aplicacion() {
  const { usuario } = Route.useLoaderData();
  return (
    <DashboardLayout
      user={usuario}
      role={usuario.role}
      preferences={usuario.preferences}
    >
      <Outlet />
    </DashboardLayout>
  );
}