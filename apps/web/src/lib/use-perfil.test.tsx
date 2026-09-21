// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePerfil } from './use-perfil';

const apiFetchMock = vi.fn();

vi.mock('./api/cliente', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('./auth/sesion', () => ({
  sesionActual: async () => ({
    email: 'ana@demo.com',
    userId: 'u1',
    accessToken: 't',
    refreshToken: 'r',
  }),
}));

function Consumidor() {
  const { data } = usePerfil();
  return <span>{data?.profile?.full_name ?? 'sin datos'}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiFetchMock.mockResolvedValue({
    profile: { id: 'u1', full_name: 'Ana' },
    organization: null,
    org_settings: null,
    schedules: [],
  });
});

describe('usePerfil', () => {
  it('dos consumidores comparten una sola petición', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Consumidor />
        <Consumidor />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Ana')).toHaveLength(2);
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith('/perfil');
  });

  it('normaliza respuesta vacía a payload completo', async () => {
    apiFetchMock.mockResolvedValue(null);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Consumidor />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('sin datos')).toBeInTheDocument();
    });
  });
});
