import { describe, it, expect } from 'vitest';
import {
  errorToPayload,
  fingerprintError,
  normalizeError,
} from '@/lib/errores';

describe('fingerprintError', () => {
  it('es determinista para el mismo error', async () => {
    const a = await fingerprintError('TypeError', 'boom');
    const b = await fingerprintError('TypeError', 'boom');
    expect(a).toBe(b);
  });

  it('difiere entre errores distintos', async () => {
    const a = await fingerprintError('TypeError', 'boom');
    const b = await fingerprintError('TypeError', 'otro');
    expect(a).not.toBe(b);
  });

  it('ignora el nombre ausente', async () => {
    const a = await fingerprintError(undefined, 'boom');
    const b = await fingerprintError('', 'boom');
    expect(a).toBe(b);
  });
});

describe('normalizeError', () => {
  it('extrae Error nativo', () => {
    const err = new TypeError('falló');
    expect(normalizeError(err)).toEqual({
      message: 'falló',
      name: 'TypeError',
      stack: expect.any(String),
    });
  });

  it('envuelve string', () => {
    expect(normalizeError('falló')).toEqual({
      message: 'falló',
      name: 'Error',
      stack: undefined,
    });
  });

  it('extrae objeto con message/name', () => {
    expect(normalizeError({ message: 'x', name: 'CustomError' })).toEqual({
      message: 'x',
      name: 'CustomError',
      stack: undefined,
    });
  });

  it('cubre valores desconocidos', () => {
    expect(normalizeError(null).message).toBe('Error desconocido');
    expect(normalizeError(42).message).toBe('42');
  });
});

describe('errorToPayload', () => {
  it('arma payload con extras', () => {
    const payload = errorToPayload(new Error('boom'), 'server', {
      route: '/api/x',
      method: 'POST',
    });
    expect(payload).toEqual({
      source: 'server',
      message: 'boom',
      name: 'Error',
      stack: expect.any(String),
      route: '/api/x',
      method: 'POST',
    });
  });
});