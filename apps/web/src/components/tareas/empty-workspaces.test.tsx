// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EmptyWorkspaces } from './empty-workspaces';
import type { Profile } from '@/types';

const collaborators: Profile[] = [
  {
    id: 'p1',
    email: 'ana@demo.com',
    organization_id: 'org1',
    role: 'collaborator',
    is_owner: false,
    full_name: 'Ana',
    telegram_chat_id: null,
    blocked: false,
    daily_hours: 8,
    weekly_hours: 40,
    phone: null,
    position: null,
    bio: null,
    language: 'es',
    birth_date: null,
    address: null,
    alternate_phones: null,
    emergency_contacts: null,
    preferences: null,
    created_at: '2026-01-01',
  },
];

describe('EmptyWorkspaces', () => {
  it('sin permisos no muestra el botón de crear', () => {
    render(
      <EmptyWorkspaces
        canManage={false}
        collaborators={collaborators}
        onCreate={vi.fn()}
      />
    );
    expect(
      screen.getByText('Sin áreas de trabajo')
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /crear área/i })).toBeNull();
  });

  it('el diálogo de creación incluye la opción de visibilidad y personal asignado', () => {
    const onCreate = vi.fn();
    render(
      <EmptyWorkspaces
        canManage
        collaborators={collaborators}
        onCreate={onCreate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /crear área/i }));
    expect(screen.getByText('Visibilidad')).toBeTruthy();

    const input = screen.getByLabelText('Nombre') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Operaciones' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(onCreate).toHaveBeenCalledWith({
      name: 'Operaciones',
      visibility: 'public',
      memberIds: [],
      memberGrants: {},
    });
  });

  it('doble clic en Crear solo invoca onCreate una vez', async () => {
    let resolver: (v: { error?: string } | undefined) => void = () => {};
    const onCreate = vi.fn(
      () =>
        new Promise<{ error?: string } | undefined>((res) => {
          resolver = res;
        })
    );
    render(
      <EmptyWorkspaces
        canManage
        collaborators={collaborators}
        onCreate={onCreate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /crear área/i }));
    const input = screen.getByLabelText('Nombre') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Operaciones' } });

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    const boton = await screen.findByRole('button', { name: /creando/i });
    expect(boton).toBeDisabled();

    fireEvent.click(boton);
    expect(onCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolver(undefined);
    });
  });
});