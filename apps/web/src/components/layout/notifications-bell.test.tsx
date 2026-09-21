// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationsBell } from './notifications-bell';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

const pushMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/cliente', () => ({ api: apiMock }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/calendario',
}));

const NOTIFICACIONES = [
  {
    id: 'n1',
    type: 'task_assigned' as const,
    title: 'Te asignaron la tarea «Demo»',
    body: null,
    reference_type: 'task',
    reference_id: '11111111-1111-4111-8111-111111111111',
    read: false,
    created_at: new Date().toISOString(),
  },
];

function renderBell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsBell />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockResolvedValue({ notificaciones: NOTIFICACIONES, noLeidas: 1 });
  apiMock.patch.mockResolvedValue({ success: true });
  apiMock.post.mockResolvedValue({ success: true });
});

describe('NotificationsBell', () => {
  it('muestra el badge de no leídas y el listado', async () => {
    renderBell();

    await waitFor(() => {
      expect(
        screen.getByLabelText('Notificaciones (1 sin leer)'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Notificaciones (1 sin leer)'));
    expect(
      await screen.findByText('Te asignaron la tarea «Demo»'),
    ).toBeInTheDocument();
  });

  it('marca leída y navega a la tarea al hacer clic', async () => {
    renderBell();
    fireEvent.click(
      await screen.findByLabelText('Notificaciones (1 sin leer)'),
    );
    fireEvent.click(await screen.findByText('Te asignaron la tarea «Demo»'));

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith(
        '/notificaciones/n1/leida',
        { leida: true },
      );
    });
    expect(pushMock).toHaveBeenCalledWith(
      '/proyectos/111111111111',
    );
  });

  it('marca todas como leídas', async () => {
    renderBell();
    fireEvent.click(
      await screen.findByLabelText('Notificaciones (1 sin leer)'),
    );
    fireEvent.click(await screen.findByRole('button', { name: /marcar leídas/i }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith('/notificaciones/leer-todas');
    });
  });
});
