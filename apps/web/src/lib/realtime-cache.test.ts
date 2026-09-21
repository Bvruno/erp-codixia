// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  aplicarEventoLista,
  idDeEvento,
  leerEvento,
  parchearQuery,
} from './realtime-cache';

type Fila = { id: string; nombre: string; extra?: string };

const evt = (eventType: 'INSERT' | 'UPDATE' | 'DELETE', newFila?: unknown, oldFila?: unknown) => ({
  eventType,
  table: 'demo',
  new: (newFila ?? {}) as Record<string, unknown>,
  old: (oldFila ?? {}) as Record<string, unknown>,
});

describe('leerEvento', () => {
  it('parsea un payload de postgres_changes', () => {
    const e = leerEvento({ eventType: 'UPDATE', table: 'tasks', new: { id: 't1' }, old: {} });
    expect(e).toEqual({ eventType: 'UPDATE', table: 'tasks', new: { id: 't1' }, old: {} });
  });

  it('devuelve null para payloads inválidos', () => {
    expect(leerEvento(null)).toBeNull();
    expect(leerEvento({ eventType: 'OTRO' })).toBeNull();
  });
});

describe('idDeEvento', () => {
  it('usa new.id en INSERT/UPDATE y old.id en DELETE', () => {
    expect(idDeEvento(evt('INSERT', { id: 'a' }))).toBe('a');
    expect(idDeEvento(evt('DELETE', {}, { id: 'b' }))).toBe('b');
    expect(idDeEvento(evt('DELETE'))).toBeNull();
  });
});

describe('aplicarEventoLista', () => {
  const lista: Fila[] = [
    { id: '1', nombre: 'uno' },
    { id: '2', nombre: 'dos', extra: 'x' },
  ];

  it('hace upsert en UPDATE conservando campos no presentes', () => {
    const r = aplicarEventoLista<Fila>(lista, evt('UPDATE', { id: '2', nombre: 'dos!' }));
    expect(r.aplicado).toBe(true);
    expect(r.lista).toEqual([
      { id: '1', nombre: 'uno' },
      { id: '2', nombre: 'dos!', extra: 'x' },
    ]);
  });

  it('aplica el merge custom si se pasa', () => {
    const r = aplicarEventoLista<Fila>(
      lista,
      evt('UPDATE', { id: '2', nombre: 'dos!' }),
      (previo, nuevo) => ({ ...previo, ...nuevo, extra: 'fijo' })
    );
    expect(r.lista?.[1]).toEqual({ id: '2', nombre: 'dos!', extra: 'fijo' });
  });

  it('inserta filas nuevas al final', () => {
    const r = aplicarEventoLista<Fila>(lista, evt('INSERT', { id: '3', nombre: 'tres' }));
    expect(r.lista).toHaveLength(3);
    expect(r.lista?.[2]).toEqual({ id: '3', nombre: 'tres' });
  });

  it('elimina por old.id en DELETE', () => {
    const r = aplicarEventoLista<Fila>(lista, evt('DELETE', {}, { id: '1' }));
    expect(r.lista).toEqual([{ id: '2', nombre: 'dos', extra: 'x' }]);
  });

  it('DELETE de una fila ausente es no-op exitoso', () => {
    const r = aplicarEventoLista<Fila>(lista, evt('DELETE', {}, { id: 'zzz' }));
    expect(r.aplicado).toBe(true);
    expect(r.lista).toBe(lista);
  });

  it('sin data no aplica', () => {
    const r = aplicarEventoLista<Fila>(undefined, evt('INSERT', { id: '3' }));
    expect(r.aplicado).toBe(false);
    expect(r.lista).toBeUndefined();
  });
});

describe('parchearQuery', () => {
  it('actualiza la data de la query y no-opea sin data', () => {
    const qc = new QueryClient();
    qc.setQueryData(['demo'], { n: 1 });
    const updater = vi.fn((data: { n: number }) => ({ n: data.n + 1 }));
    parchearQuery<{ n: number }>(qc, ['demo'], updater);
    expect(qc.getQueryData(['demo'])).toEqual({ n: 2 });
    expect(updater).toHaveBeenCalledTimes(1);

    parchearQuery<{ n: number }>(qc, ['sin-data'], updater);
    expect(updater).toHaveBeenCalledTimes(1);
  });
});
