// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToDoView } from '@/components/tareas/todo-view';
import type { TodoBoardRow } from '@/types';

function renderConQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const ROWS: TodoBoardRow[] = [
  {
    id: 'r1',
    name: 'Regar plantas',
    frequency: 'daily',
    interval_days: null,
    target_quantity: 1,
    active: true,
    week_days: null,
    due_time: null,
    quantity_done: 0,
    cycle_start: '2026-08-21T00:00:00Z',
    cycle_end: '2026-08-22T00:00:00Z',
  },
  {
    id: 'r2',
    name: 'Hacer 10 llamadas',
    frequency: 'interval',
    interval_days: 3,
    target_quantity: 10,
    active: true,
    week_days: null,
    due_time: '14:00',
    quantity_done: 3,
    cycle_start: '2026-08-20T00:00:00Z',
    cycle_end: '2026-08-23T00:00:00Z',
  },
  {
    id: 'r3',
    name: 'Cerrar caja',
    frequency: 'daily',
    interval_days: null,
    target_quantity: 1,
    active: true,
    week_days: [1, 3, 5],
    due_time: null,
    quantity_done: 1,
    cycle_start: '2026-08-21T00:00:00Z',
    cycle_end: '2026-08-22T00:00:00Z',
  },
];

let canWriteValue = true;

const apiFetchMock = vi.fn();
const postMock = vi.fn();

const supabaseMock = {
  auth: {
    getSession: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: 'u1', email: 'u1@test.local' },
          access_token: 'token-test',
          refresh_token: 'refresh-test',
        },
      },
    }),
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  },
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => supabaseMock,
}));

vi.mock('@/lib/api/cliente', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  api: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/components/tareas/tareas-context', () => ({
  useTareas: () => ({
    todos: [
      {
        id: 'todo1',
        name: 'TO-DO QA',
        workspace_id: 'ws1',
        folder_id: null,
        organization_id: 'o1',
        visibility: 'public',
        position: 0,
        created_by: null,
        created_at: '',
        updated_at: '',
      },
    ],
    canWrite: () => canWriteValue,
    isAdmin: false,
    openShare: () => {},
    shareTarget: null,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  canWriteValue = true;
  apiFetchMock.mockImplementation((url: string) => {
    if (url === '/todos/todo1/board') {
      return Promise.resolve({ rows: ROWS, timezone: 'UTC', preferences: null });
    }
    return Promise.reject(new Error(`URL inesperada: ${url}`));
  });
  postMock.mockResolvedValue({ success: true });
});

describe('ToDoView', () => {
  it('muestra nombre del TO-DO, ciclo y filas', async () => {
    renderConQuery(<ToDoView todoId="todo1" />);
    expect(await screen.findByText('TO-DO QA')).toBeInTheDocument();
    expect(screen.getByText('Hoy')).toBeInTheDocument();
    expect(
      screen.getByText((content, el) => el?.tagName === 'P' && content.includes('1 de 3 completadas'))
    ).toBeInTheDocument();
    expect(screen.getByText('Regar plantas')).toBeInTheDocument();
    expect(screen.getByText('Hacer 10 llamadas')).toBeInTheDocument();
    expect(screen.getByText('3/10')).toBeInTheDocument();
    expect(screen.getAllByText('Cada 3 días').length).toBeGreaterThan(0);
  });

  it('checkbox llama tick con delta 1', async () => {
    renderConQuery(<ToDoView todoId="todo1" />);
    const checkbox = await screen.findByRole('checkbox', { name: 'Completar Regar plantas' });
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/todos/todo1/items/r1/tick', { delta: 1 });
    });
  });

  it('contador suma y resta con delta correcto', async () => {
    renderConQuery(<ToDoView todoId="todo1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sumar a Hacer 10 llamadas' }));
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/todos/todo1/items/r2/tick', { delta: 1 });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restar a Hacer 10 llamadas' }));
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/todos/todo1/items/r2/tick', { delta: -1 });
    });
  });

  it('completadas ocultas por defecto y expandibles', async () => {
    renderConQuery(<ToDoView todoId="todo1" />);
    const toggle = await screen.findByRole('button', { name: /Completadas \(1\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Cerrar caja')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Cerrar caja')).toBeInTheDocument();
  });

  it('quick-add inserta item en el TO-DO', async () => {
    renderConQuery(<ToDoView todoId="todo1" />);
    const input = await screen.findByPlaceholderText('Agregar tarea repetitiva…');
    fireEvent.change(input, { target: { value: 'Barrer local' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/todos/todo1/items', {
        items: [
          expect.objectContaining({
            name: 'Barrer local',
            frequency: 'daily',
            target_quantity: 1,
            created_by: 'u1',
          }),
        ],
      });
    });
  });

  it('doble Enter en quick-add solo crea un item', async () => {
    renderConQuery(<ToDoView todoId="todo1" />);
    const input = await screen.findByPlaceholderText('Agregar tarea repetitiva…');
    fireEvent.change(input, { target: { value: 'Barrer local' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      const llamadasItems = postMock.mock.calls.filter(
        ([url]) => url === '/todos/todo1/items'
      );
      expect(llamadasItems).toHaveLength(1);
    });
  });

  it('no llama board con slug sin resolver', async () => {
    renderConQuery(<ToDoView todoId="slug-inexistente" />);
    expect(apiFetchMock).not.toHaveBeenCalledWith('/todos/todo1/board', undefined);
  });

  it('sin permisos no muestra quick-add ni opciones', async () => {
    canWriteValue = false;
    renderConQuery(<ToDoView todoId="todo1" />);
    expect(await screen.findByText('Regar plantas')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Agregar tarea repetitiva…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Opciones de Regar plantas' })).not.toBeInTheDocument();
  });
});