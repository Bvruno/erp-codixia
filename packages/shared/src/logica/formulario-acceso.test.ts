import { describe, it, expect } from 'vitest';
import {
  evaluarAccesoFormulario,
  identificadorEnLista,
  normalizarIdentificador,
} from '@/lib/formulario-acceso';
import { AJUSTES_FORMULARIO_DEFAULT } from '@/types';
import type { AjustesFormulario } from '@/types';

const ajustes = (patch: Partial<AjustesFormulario> = {}): AjustesFormulario => ({
  ...AJUSTES_FORMULARIO_DEFAULT,
  ...patch,
});

describe('normalizarIdentificador', () => {
  it('correo a minúsculas y trim', () => {
    expect(normalizarIdentificador('email', '  Ana@Example.COM ')).toBe('ana@example.com');
  });

  it('dni sin espacios, puntos ni guiones', () => {
    expect(normalizarIdentificador('dni', ' 12.345.678-9 ')).toBe('123456789');
  });
});

describe('identificadorEnLista', () => {
  const lista = [
    { tipo: 'email' as const, valor: 'ana@example.com' },
    { tipo: 'dni' as const, valor: '12345678' },
  ];

  it('encuentra por correo normalizado', () => {
    expect(identificadorEnLista(lista, { tipo: 'email', valor: 'ANA@example.com' })).toBe(true);
  });

  it('encuentra dni con formato distinto', () => {
    expect(identificadorEnLista(lista, { tipo: 'dni', valor: '12.345.678' })).toBe(true);
  });

  it('no cruza tipos', () => {
    expect(identificadorEnLista(lista, { tipo: 'dni', valor: 'ana@example.com' })).toBe(false);
  });
});

describe('evaluarAccesoFormulario', () => {
  it('borrador no acepta respuestas', () => {
    const res = evaluarAccesoFormulario(ajustes(), { estado: 'borrador' });
    expect(res).toEqual({ permitido: false, motivo: 'no_publicado' });
  });

  it('público permite anónimo', () => {
    const res = evaluarAccesoFormulario(ajustes(), { estado: 'publicado' });
    expect(res).toEqual({ permitido: true, motivo: 'ok' });
  });

  it('público bloquea reenvío si ya respondió', () => {
    const res = evaluarAccesoFormulario(ajustes(), {
      estado: 'publicado',
      yaRespondio: true,
    });
    expect(res.motivo).toBe('ya_respondio');
  });

  it('lista blanca exige identificador', () => {
    const res = evaluarAccesoFormulario(ajustes({ modo_acceso: 'lista' }), {
      estado: 'publicado',
    });
    expect(res.motivo).toBe('requiere_identificacion');
  });

  it('lista blanca permite solo listados', () => {
    const a = ajustes({ modo_acceso: 'lista', lista_modo: 'blanca' });
    const lista = [{ tipo: 'email' as const, valor: 'cliente@x.com' }];

    expect(
      evaluarAccesoFormulario(a, {
        estado: 'publicado',
        lista,
        identificador: { tipo: 'email', valor: 'cliente@x.com' },
      })
    ).toEqual({ permitido: true, motivo: 'ok' });

    expect(
      evaluarAccesoFormulario(a, {
        estado: 'publicado',
        lista,
        identificador: { tipo: 'email', valor: 'otro@x.com' },
      }).motivo
    ).toBe('no_listado');
  });

  it('lista negra bloquea solo listados', () => {
    const a = ajustes({ modo_acceso: 'lista', lista_modo: 'negra' });
    const lista = [{ tipo: 'dni' as const, valor: '999' }];

    expect(
      evaluarAccesoFormulario(a, {
        estado: 'publicado',
        lista,
        identificador: { tipo: 'dni', valor: '999' },
      }).motivo
    ).toBe('bloqueado');

    expect(
      evaluarAccesoFormulario(a, {
        estado: 'publicado',
        lista,
        identificador: { tipo: 'dni', valor: '111' },
      })
    ).toEqual({ permitido: true, motivo: 'ok' });
  });

  it('rechaza tipo de identificador no habilitado', () => {
    const a = ajustes({ modo_acceso: 'lista', identificadores: ['email'] });
    const res = evaluarAccesoFormulario(a, {
      estado: 'publicado',
      identificador: { tipo: 'dni', valor: '123' },
    });
    expect(res.motivo).toBe('identificador_invalido');
  });

  it('personal exige invitación', () => {
    const res = evaluarAccesoFormulario(ajustes({ modo_acceso: 'personal' }), {
      estado: 'publicado',
    });
    expect(res.motivo).toBe('requiere_invitacion');
  });

  it('invitado pendiente permite aunque el modo sea personal', () => {
    const res = evaluarAccesoFormulario(ajustes({ modo_acceso: 'personal' }), {
      estado: 'publicado',
      invitado: { estado: 'pendiente' },
    });
    expect(res).toEqual({ permitido: true, motivo: 'ok' });
  });

  it('invitado que ya respondió queda bloqueado', () => {
    const res = evaluarAccesoFormulario(ajustes(), {
      estado: 'publicado',
      invitado: { estado: 'respondido' },
    });
    expect(res.motivo).toBe('ya_respondio');
  });

  it('invitado revocado queda bloqueado', () => {
    const res = evaluarAccesoFormulario(ajustes(), {
      estado: 'publicado',
      invitado: { estado: 'revocado' },
    });
    expect(res.motivo).toBe('invitado_revocado');
  });

  it('cerrado no acepta respuestas', () => {
    const res = evaluarAccesoFormulario(ajustes(), { estado: 'cerrado' });
    expect(res.motivo).toBe('no_publicado');
  });
});
