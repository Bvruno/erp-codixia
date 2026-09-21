// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DashboardLayout from './dashboard-layout';
import { DEFAULT_PREFERENCES } from '@/types';
import type { PerfilPayload } from '@/lib/use-perfil';

vi.mock('next/navigation', () => ({
  usePathname: () => '/perfil',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children?: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const usuario = {
  email: 'ana@demo.com',
  full_name: 'Ana',
  role: 'collaborator',
  is_owner: false,
  preferences: null,
};

function payloadCon(density: 'normal' | 'compact'): PerfilPayload {
  return {
    profile: {
      id: 'u1',
      preferences: { ...DEFAULT_PREFERENCES, density },
    },
    organization: null,
    org_settings: null,
    schedules: [],
    email: 'ana@demo.com',
  } as unknown as PerfilPayload;
}

function renderLayout(
  client: QueryClient,
  preferences: Partial<typeof DEFAULT_PREFERENCES> | null = null
) {
  return render(
    <QueryClientProvider client={client}>
      <DashboardLayout user={usuario} role="collaborator" preferences={preferences}>
        <div>contenido</div>
      </DashboardLayout>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  document.documentElement.dataset.density = 'normal';
  document.documentElement.classList.remove('high-contrast', 'reduce-motion');
  localStorage.clear();
});

describe('DashboardLayout densidad', () => {
  it('aplica data-density compact desde las preferencias del loader', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderLayout(client, { ...DEFAULT_PREFERENCES, density: 'compact' });

    expect(document.documentElement.dataset.density).toBe('compact');
  });

  it('refleja en vivo el cambio guardado en la caché de perfil', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['perfil', 'datos'], payloadCon('normal'));

    renderLayout(client, { ...DEFAULT_PREFERENCES, density: 'normal' });
    expect(document.documentElement.dataset.density).toBe('normal');

    await act(async () => {
      client.setQueryData(['perfil', 'datos'], payloadCon('compact'));
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.density).toBe('compact');
    });
  });

  it('compacta el padding de los enlaces del nav', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['perfil', 'datos'], payloadCon('compact'));

    const { getAllByText } = renderLayout(client);
    const enlace = getAllByText('Calendario')[0].closest('a');
    expect(enlace?.className).toContain('py-1.5');
  });
});
