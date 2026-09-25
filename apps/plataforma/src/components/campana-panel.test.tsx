import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/lib/api/cliente', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '@/lib/api/cliente';
import { CampanaPanel } from './campana-panel';

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue({
    data: [
      {
        id: 2,
        evento: 'solicitud_nueva',
        titulo: 'Solicitud nueva',
        cuerpo: 'Acme — Ana',
        entidad_tipo: null,
        entidad_id: null,
        leida: false,
        created_at: new Date().toISOString(),
      },
      {
        id: 1,
        evento: 'factura_pagada',
        titulo: 'Factura pagada',
        cuerpo: 'Acme',
        entidad_tipo: null,
        entidad_id: null,
        leida: true,
        created_at: new Date().toISOString(),
      },
    ],
    no_leidas: 1,
  } as never);
  mockedPost.mockResolvedValue({ ok: true, marcadas: 2 } as never);
});

describe('CampanaPanel', () => {
  it('coloca el panel a la derecha del botón en escritorio', async () => {
    render(<CampanaPanel />);
    await screen.findByText('1');
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));

    const panel = (await screen.findByText('Solicitud nueva')).closest('.md\\:left-full');
    expect(panel).not.toBeNull();
  });

  it('muestra el contador de no leídas y el listado al abrir', async () => {
    render(<CampanaPanel />);

    expect(await screen.findByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));

    expect(await screen.findByText('Solicitud nueva')).toBeInTheDocument();
    expect(screen.getByText('Factura pagada')).toBeInTheDocument();
  });

  it('marca todas como leídas', async () => {
    render(<CampanaPanel />);
    await screen.findByText('1');
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    await screen.findByText('Solicitud nueva');

    fireEvent.click(screen.getByRole('button', { name: /Marcar leídas/ }));

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/plataforma/telegram/notificaciones/leer', {
        ids: undefined,
      })
    );
  });
});
