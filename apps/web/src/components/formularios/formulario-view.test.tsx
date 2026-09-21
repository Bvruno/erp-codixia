// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormularioView } from './formulario-view';
import { AJUSTES_FORMULARIO_DEFAULT } from '@/types';
import type { Formulario } from '@/types';

const estado = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  pathname: '/proyectos/general/raiz/formulario/nombre-viejo',
  replace: vi.fn(),
  push: vi.fn(),
  formulario: null as unknown,
  apiFetch: vi.fn(),
}));

vi.mock('@/components/tareas/tareas-context', () => ({
  useTareas: () => estado.ctx,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: estado.replace, push: estado.push }),
  usePathname: () => estado.pathname,
}));

vi.mock('@/lib/api/cliente', () => ({
  apiFetch: (ruta: string) => estado.apiFetch(ruta),
  api: { put: vi.fn(async () => ({ success: true })), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ErrorApi: class ErrorApi extends Error {},
}));

vi.mock('@/lib/auth/actions', () => ({
  createInvitation: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const formulario = (patch: Partial<Formulario> & { id: string; name: string }): Formulario => ({
  organization_id: 'org',
  workspace_id: 'w1',
  folder_id: null,
  description: null,
  visibility: 'public',
  estado: 'borrador',
  position: 0,
  esquema: {
    version: 1,
    secciones: [
      {
        id: 's1',
        titulo: 'Sección',
        preguntas: [{ id: 'q1', tipo: 'texto_corto', titulo: 'Nombre', requerida: false }],
      },
    ],
  },
  ajustes: AJUSTES_FORMULARIO_DEFAULT,
  publicado_at: null,
  created_by: null,
  created_at: '',
  updated_at: '',
  ...patch,
});

function ctxCon(formularios: Formulario[]) {
  return {
    loading: false,
    formularios,
    workspaces: [{ id: 'w1', name: 'General', position: 0 }],
    folders: [],
    canWrite: () => true,
    canManageEntity: () => true,
    refetch: vi.fn(),
    openShare: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.pathname = '/proyectos/general/raiz/formulario/nombre-viejo';
  estado.formulario = formulario({ id: 'f1', name: 'Nombre Viejo' });
  estado.apiFetch.mockResolvedValue({ formulario: estado.formulario });
});

describe('FormularioView y renombrado', () => {
  it('carga normalmente cuando el slug de la URL es el actual', async () => {
    estado.ctx = ctxCon([formulario({ id: 'f1', name: 'Nombre Viejo' })]);
    render(<FormularioView formularioId="nombre-viejo" />);
    expect(await screen.findByDisplayValue('Nombre Viejo')).toBeInTheDocument();
    expect(estado.replace).not.toHaveBeenCalled();
  });

  it('no se rompe al renombrar: sigue la vista y sanea la URL al slug nuevo', async () => {
    estado.ctx = ctxCon([formulario({ id: 'f1', name: 'Nombre Viejo' })]);
    const { rerender } = render(<FormularioView formularioId="nombre-viejo" />);
    expect(await screen.findByDisplayValue('Nombre Viejo')).toBeInTheDocument();

    // El árbol se refresca con el nombre nuevo (realtime) dejando el slug viejo.
    estado.ctx = ctxCon([formulario({ id: 'f1', name: 'Nombre Nuevo' })]);
    rerender(<FormularioView formularioId="nombre-viejo" />);

    expect(screen.queryByText('Formulario no encontrado')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Nombre Viejo')).toBeInTheDocument();
    expect(estado.apiFetch).toHaveBeenCalledTimes(1);
    expect(estado.replace).toHaveBeenCalledWith(
      '/proyectos/general/raiz/formulario/nombre-nuevo'
    );
  });

  it('sana la URL una sola vez aunque el árbol se refresque varias veces', async () => {
    estado.ctx = ctxCon([formulario({ id: 'f1', name: 'Nombre Viejo' })]);
    const { rerender } = render(<FormularioView formularioId="nombre-viejo" />);
    expect(await screen.findByDisplayValue('Nombre Viejo')).toBeInTheDocument();

    // Varios refrescos (realtime/refetch) con el nombre nuevo y slug viejo.
    for (let i = 0; i < 3; i += 1) {
      estado.ctx = ctxCon([formulario({ id: 'f1', name: 'Nombre Nuevo' })]);
      rerender(<FormularioView formularioId="nombre-viejo" />);
    }

    expect(estado.replace).toHaveBeenCalledTimes(1);
    expect(estado.replace).toHaveBeenCalledWith(
      '/proyectos/general/raiz/formulario/nombre-nuevo'
    );
  });

  it('tras el sanado no vuelve a navegar con el slug actualizado', async () => {
    estado.ctx = ctxCon([formulario({ id: 'f1', name: 'Nombre Nuevo' })]);
    render(<FormularioView formularioId="nombre-nuevo" />);
    expect(await screen.findByDisplayValue('Nombre Viejo')).toBeInTheDocument();
    expect(estado.replace).not.toHaveBeenCalled();
  });

  it('muestra "no encontrado" cuando el parámetro no resuelve a nada', async () => {
    estado.ctx = ctxCon([]);
    render(<FormularioView formularioId="no-existe" />);
    expect(await screen.findByText('Formulario no encontrado')).toBeInTheDocument();
    expect(estado.apiFetch).not.toHaveBeenCalled();
  });
});
