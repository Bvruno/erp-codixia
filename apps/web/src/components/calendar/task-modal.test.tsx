// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskModal } from '@/components/calendar/task-modal';
import type { AccessTree } from '@/lib/access';
import type { TaskList } from '@/types';

vi.mock('@/lib/auth/actions', () => ({
  saveAssignmentGrants: vi.fn(),
  createInvitation: vi.fn(),
}));

const ARBOL: AccessTree = {
  workspaces: [],
  folders: [],
  lists: [],
  documents: [],
  mindmaps: [],
  todos: [],
  formularios: [],
};

const LISTAS = [
  { id: 'l1', name: 'Lista 1', statuses: null, priorities: null },
] as unknown as TaskList[];

function modal(key: string, defaultDate: Date) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TaskModal
        key={key}
        open
        onClose={() => {}}
        onSaved={() => {}}
        organizationId="org1"
        lists={LISTAS}
        collaborators={[]}
        isAdmin
        defaultDate={defaultDate}
        tree={ARBOL}
      />
    </QueryClientProvider>
  );
}

// El diálogo se renderiza en un portal sobre document.body.
const inputFecha = () =>
  document.querySelector('input[type="date"]') as HTMLInputElement;

describe('TaskModal — fecha límite por defecto', () => {
  it('inicializa la fecha límite con el día seleccionado', () => {
    render(modal('2026-8-17', new Date(2026, 8, 17)));
    expect(inputFecha().value).toBe('2026-09-17');
  });

  it('al remontar (cambio de selección en calendario) resetea la fecha', () => {
    const { rerender } = render(modal('2026-8-17', new Date(2026, 8, 17)));
    fireEvent.change(inputFecha(), { target: { value: '2026-10-01' } });
    expect(inputFecha().value).toBe('2026-10-01');

    // El calendario remonta con una key distinta por cada selección.
    rerender(modal('2026-8-20', new Date(2026, 8, 20)));
    expect(inputFecha().value).toBe('2026-09-20');
  });
});
