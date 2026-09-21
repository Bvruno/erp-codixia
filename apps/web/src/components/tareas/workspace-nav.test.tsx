// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WorkspaceNav } from './workspace-nav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/proyectos',
}));

const baseProps: Omit<ComponentProps<typeof WorkspaceNav>, 'onCreate'> = {
  workspaces: [],
  folders: [],
  lists: [],
  documents: [],
  mindmaps: [],
  todos: [],
  formularios: [],
  counts: {},
  selectedListId: null,
  onSelectList: vi.fn(),
  onOpenDashboard: vi.fn(),
  onOpenDocument: vi.fn(),
  onOpenMindMap: vi.fn(),
  onOpenTodo: vi.fn(),
  onOpenFormulario: vi.fn(),
  canManage: true,
  canManageEntity: () => true,
  canWriteEntity: () => true,
  onOpenEdit: vi.fn(),
  collaborators: [],
  onDelete: vi.fn(),
  onMoveEntity: vi.fn(async () => undefined),
  onClone: vi.fn(async () => undefined),
  onReorderTo: vi.fn(),
};

describe('WorkspaceNav', () => {
  it('doble clic en Crear solo invoca onCreate una vez', async () => {
    let resolver: (v: { error?: string } | undefined) => void = () => {};
    const onCreate = vi.fn(
      () =>
        new Promise<{ error?: string } | undefined>((res) => {
          resolver = res;
        })
    );
    render(<WorkspaceNav {...baseProps} onCreate={onCreate} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Nuevo espacio de trabajo' })
    );
    const input = await screen.findByLabelText('Nombre');
    fireEvent.change(input, { target: { value: 'Comercial' } });

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    const boton = await screen.findByRole('button', { name: /creando/i });
    expect(boton).toBeDisabled();

    fireEvent.click(boton);
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'workspace', name: 'Comercial' })
    );

    await act(async () => {
      resolver(undefined);
    });
  });

  it('clona una lista con nombre por defecto editable', async () => {
    const onClone = vi.fn(async () => undefined);
    render(
      <WorkspaceNav
        {...baseProps}
        onCreate={vi.fn()}
        onClone={onClone}
        workspaces={[
          {
            id: 'ws-1',
            organization_id: 'org-1',
            name: 'Comercial',
            position: 0,
            visibility: 'public',
            default_statuses: null,
            default_priorities: null,
            created_at: 'x',
          },
        ]}
        lists={[
          {
            id: 'lista-1',
            organization_id: 'org-1',
            workspace_id: 'ws-1',
            folder_id: null,
            name: 'Ventas',
            position: 0,
            visibility: 'public',
            statuses: null,
            priorities: null,
            created_at: 'x',
          },
        ]}
      />
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Opciones de Ventas' }),
      { button: 0, ctrlKey: false }
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: /Clonar/ }));
    const input = await screen.findByLabelText('Nombre del clon');
    expect(input).toHaveValue('Copia de Ventas');

    fireEvent.change(input, { target: { value: 'Copia editada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clonar' }));
    await act(async () => {});
    expect(onClone).toHaveBeenCalledWith({
      type: 'list',
      id: 'lista-1',
      name: 'Copia editada',
    });
  });
});
