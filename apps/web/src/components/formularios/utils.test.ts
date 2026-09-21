import { describe, it, expect } from 'vitest';
import {
  construirEnlaceInvitado,
  construirEnlacePublico,
  nombreDuplicado,
  resolverFormularioActual,
} from './utils';
import { AJUSTES_FORMULARIO_DEFAULT } from '@/types';
import type { Formulario } from '@/types';

const form = (patch: Partial<Formulario> & { id: string; name: string }): Formulario => ({
  organization_id: 'org',
  workspace_id: 'w1',
  folder_id: null,
  description: null,
  visibility: 'public',
  estado: 'borrador',
  position: 0,
  esquema: { version: 1, secciones: [] },
  ajustes: AJUSTES_FORMULARIO_DEFAULT,
  publicado_at: null,
  created_by: null,
  created_at: '',
  updated_at: '',
  ...patch,
});

describe('resolverFormularioActual', () => {
  const formularios = [
    form({ id: 'f1', name: 'Encuesta Cliente' }),
    form({ id: 'f2', name: 'Otra Cosa' }),
  ];

  it('resuelve por slug actual', () => {
    expect(resolverFormularioActual('encuesta-cliente', formularios)?.id).toBe('f1');
  });

  it('resuelve por UUID directo', () => {
    expect(
      resolverFormularioActual('f2', formularios)?.id
    ).toBe('f2');
  });

  it('usa el id del formulario cargado cuando el slug quedó viejo (renombrado)', () => {
    const renombrados = [form({ id: 'f1', name: 'Nombre Nuevo' })];
    expect(resolverFormularioActual('encuesta-cliente', renombrados, 'f1')?.id).toBe('f1');
  });

  it('devuelve undefined si el parámetro no corresponde a nada', () => {
    expect(resolverFormularioActual('no-existe', formularios)).toBeUndefined();
  });
});

describe('nombreDuplicado', () => {
  const formularios = [
    form({ id: 'f1', name: 'Encuesta', workspace_id: 'w1' }),
    form({ id: 'f2', name: 'Otra', workspace_id: 'w1', folder_id: 'carpeta-1' }),
  ];

  it('detecta duplicados sin distinguir mayúsculas ni espacios', () => {
    expect(nombreDuplicado(formularios, 'w1', null, '  eNcUeStA ')).toBe(true);
  });

  it('distingue contenedores (raíz vs carpeta)', () => {
    expect(nombreDuplicado(formularios, 'w1', 'carpeta-1', 'Encuesta')).toBe(false);
  });

  it('excluye el propio formulario al renombrar', () => {
    expect(nombreDuplicado(formularios, 'w1', null, 'Encuesta', 'f1')).toBe(false);
  });
});

describe('enlaces públicos', () => {
  it('construye el enlace público con nombre y código', () => {
    expect(construirEnlacePublico('https://app.test', 'Encuesta Cliente', 'ab12cd')).toBe(
      'https://app.test/f/encuesta-cliente-ab12cd'
    );
  });

  it('construye el enlace personal', () => {
    expect(construirEnlaceInvitado('https://app.test', 'Encuesta Cliente', 'zz99yy')).toBe(
      'https://app.test/f/i/encuesta-cliente-zz99yy'
    );
  });

  it('usa slug de reemplazo si el nombre no produce slug', () => {
    expect(construirEnlacePublico('https://app.test', '***', 'ab12cd')).toBe(
      'https://app.test/f/item-ab12cd'
    );
  });
});
