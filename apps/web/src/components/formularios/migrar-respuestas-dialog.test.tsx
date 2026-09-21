// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MigrarRespuestasDialog } from './migrar-respuestas-dialog';
import { AJUSTES_FORMULARIO_DEFAULT } from '@/types';
import type { Formulario, FormularioRespuesta, TaskDocument, Workspace } from '@/types';

const estado = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  push: vi.fn(),
  apiFetch: vi.fn(),
  post: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/components/tareas/tareas-context', () => ({
  useTareas: () => estado.ctx,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: estado.push, replace: vi.fn() }),
}));

vi.mock('@/lib/api/cliente', () => ({
  apiFetch: (ruta: string) => estado.apiFetch(ruta),
  api: {
    get: vi.fn(),
    post: (ruta: string, cuerpo?: unknown) => estado.post(ruta, cuerpo),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ErrorApi: class ErrorApi extends Error {},
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const formulario: Formulario = {
  id: 'form-1',
  organization_id: 'org-1',
  workspace_id: 'w1',
  folder_id: null,
  name: 'Encuesta',
  description: null,
  visibility: 'public',
  estado: 'publicado',
  position: 0,
  esquema: {
    version: 1,
    secciones: [
      {
        id: 's1',
        titulo: 'General',
        preguntas: [
          { id: 'nombre', tipo: 'texto_corto', titulo: 'Nombre', requerida: true },
          {
            id: 'plan',
            tipo: 'opcion_multiple',
            titulo: 'Plan',
            requerida: true,
            opciones: [
              { id: 'basico', etiqueta: 'Básico' },
              { id: 'pro', etiqueta: 'Pro' },
            ],
          },
        ],
      },
    ],
  },
  ajustes: AJUSTES_FORMULARIO_DEFAULT,
  publicado_at: '2026-09-01T00:00:00.000Z',
  created_by: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function respuesta(id: string, nombre: string, plan: string): FormularioRespuesta {
  return {
    id,
    formulario_id: 'form-1',
    profile_id: null,
    invitado_id: null,
    identificador_hash: null,
    consentimiento: true,
    respuestas: { nombre, plan },
    created_at: '2026-09-10T12:00:00.000Z',
    invitado_nombre: nombre,
  };
}

const respuestas = [respuesta('r1', 'Ana', 'pro'), respuesta('r2', 'Luis', 'basico')];

beforeEach(() => {
  vi.clearAllMocks();
  estado.ctx = {
    loading: false,
    documents: [
      {
        id: 'doc-9',
        organization_id: 'org-1',
        workspace_id: 'w1',
        folder_id: null,
        name: 'Informe',
        visibility: 'private',
        position: 0,
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ] satisfies TaskDocument[],
    workspaces: [
      {
        id: 'w1',
        organization_id: 'org-1',
        name: 'General',
        position: 0,
        visibility: 'private',
        default_statuses: null,
        default_priorities: null,
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ] satisfies Workspace[],
    folders: [],
    canWrite: () => true,
    organizationId: 'org-1',
    refetch: estado.refetch,
  };
  estado.apiFetch.mockResolvedValue({ paginas: [] });
  estado.post.mockImplementation(async (ruta: string) =>
    ruta === '/entidades' ? { id: 'doc-1' } : {}
  );
});

function renderDialog() {
  return render(
    <MigrarRespuestasDialog
      abierto
      onOpenChange={vi.fn()}
      formulario={formulario}
      respuestas={respuestas}
    />
  );
}

const grilla = () => screen.getByRole('table', { name: 'Respuestas para migrar' });
const preview = () => screen.getByRole('table', { name: 'Vista previa de la tabla' });
const botonMigrar = () => screen.getByRole('button', { name: 'Migrar' });

describe('MigrarRespuestasDialog', () => {
  it('muestra la grilla completa y la vista previa renderizada', () => {
    renderDialog();
    expect(screen.getByText('2 de 2 filas · 5 de 5 columnas')).toBeInTheDocument();
    expect(within(grilla()).getByText('Fecha')).toBeInTheDocument();
    expect(within(grilla()).getByText('Plan')).toBeInTheDocument();

    const tabla = preview();
    expect(within(tabla).getAllByText('Ana').length).toBeGreaterThan(0);
    expect(within(tabla).getByText('Pro')).toBeInTheDocument();
    expect(within(tabla).getByText('Plan')).toBeInTheDocument();
  });

  it('quitar una columna la excluye de la vista previa', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Columna Plan' }));
    expect(within(preview()).queryByText('Plan')).not.toBeInTheDocument();
    expect(within(preview()).getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('2 de 2 filas · 4 de 5 columnas')).toBeInTheDocument();
  });

  it('desmarcar todas las filas deshabilita la migración', () => {
    renderDialog();
    expect(botonMigrar()).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar todas las filas' }));
    expect(
      screen.getByText('Seleccioná al menos una columna y una fila.')
    ).toBeInTheDocument();
    expect(botonMigrar()).toBeDisabled();
  });

  it('desmarcar todas las columnas deshabilita la migración', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Ninguna columna' }));
    expect(botonMigrar()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Todas las columnas' }));
    expect(botonMigrar()).toBeEnabled();
  });

  it('permite ver y copiar el markdown generado', async () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Markdown' }));
    const pre = await waitFor(() => {
      const el = document.querySelector('pre');
      expect(el?.textContent).toContain('| Fecha |');
      return el!;
    });
    expect(pre.textContent).toContain('| Ana | Pro |');

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('| Nombre | Plan |')));
  });

  it('crea documento nuevo y página con la tabla', async () => {
    renderDialog();
    fireEvent.click(botonMigrar());

    await waitFor(() => expect(estado.post).toHaveBeenCalledTimes(2));
    expect(estado.post).toHaveBeenNthCalledWith(1, '/entidades', {
      type: 'document',
      workspace_id: 'w1',
      folder_id: null,
      organization_id: 'org-1',
      name: 'Encuesta — respuestas',
      position: 1,
      visibility: 'private',
    });
    expect(estado.post).toHaveBeenNthCalledWith(2, '/documentos/doc-1/paginas', {
      title: 'Respuestas — Encuesta',
      content: expect.stringContaining('| Nombre | Plan |'),
      position: 0,
    });
    const [, cuerpoPagina] = estado.post.mock.calls[1];
    expect((cuerpoPagina as { content: string }).content).toContain('| Ana | Pro |');
    expect(estado.refetch).toHaveBeenCalled();
    await waitFor(() =>
      expect(estado.push).toHaveBeenCalledWith('/proyectos/general/raiz/documento/doc-1')
    );
  });

  it('en documento existente busca por filtro y crea una página nueva', async () => {
    renderDialog();
    fireEvent.click(screen.getByLabelText(/Documento existente/));

    fireEvent.click(screen.getByRole('button', { name: 'Elegir documento…' }));
    const buscador = await screen.findByLabelText('Buscar documento');
    fireEvent.change(buscador, { target: { value: 'zzz' } });
    expect(screen.getByText('Sin resultados.')).toBeInTheDocument();
    fireEvent.change(buscador, { target: { value: 'inf' } });
    fireEvent.click(screen.getByRole('button', { name: /Informe/ }));

    fireEvent.click(botonMigrar());
    await waitFor(() =>
      expect(estado.post).toHaveBeenCalledWith(
        '/documentos/doc-9/paginas',
        expect.objectContaining({ content: expect.stringContaining('| Fecha |') })
      )
    );
    expect(estado.post).not.toHaveBeenCalledWith('/entidades', expect.anything());
    await waitFor(() =>
      expect(estado.push).toHaveBeenCalledWith('/proyectos/general/raiz/documento/informe')
    );
  });
});
