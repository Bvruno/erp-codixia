import { describe, expect, it } from 'vitest';
import {
  filtrarDestinatarios,
  notificacionHabilitada,
  type PerfilNotificable,
  type PrefNotificacion,
} from './notificaciones';

function perfil(
  id: string,
  overrides: Partial<PerfilNotificable> = {},
): PerfilNotificable {
  return {
    id,
    preferences: null,
    telegram_chat_id: null,
    blocked: false,
    organization_id: 'org-1',
    ...overrides,
  };
}

describe('notificacionHabilitada', () => {
  it('por defecto está habilitada', () => {
    expect(notificacionHabilitada(null, 'task_assigned')).toBe(true);
    expect(notificacionHabilitada({}, 'task_status')).toBe(true);
  });

  it('respeta el valor guardado', () => {
    const prefs = { notif: { task_assigned: false } };
    expect(notificacionHabilitada(prefs, 'task_assigned')).toBe(false);
    expect(notificacionHabilitada(prefs, 'note_added')).toBe(true);
  });
});

describe('filtrarDestinatarios', () => {
  const pref: PrefNotificacion = 'task_assigned';

  it('excluye al actor, bloqueados, duplicados y preferencias apagadas', () => {
    const perfiles = [
      perfil('actor'),
      perfil('ok'),
      perfil('bloqueado', { blocked: true }),
      perfil('ok'),
      perfil('off', { preferences: { notif: { task_assigned: false } } }),
    ];

    const resultado = filtrarDestinatarios(perfiles, 'actor', pref).map(
      (p) => p.id,
    );
    expect(resultado).toEqual(['ok']);
  });

  it('devuelve todos los elegibles cuando no hay actor', () => {
    const resultado = filtrarDestinatarios(
      [perfil('a'), perfil('b')],
      null,
      pref,
    );
    expect(resultado.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
