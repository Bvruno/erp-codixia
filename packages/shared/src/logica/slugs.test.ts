import { describe, it, expect } from 'vitest';
import {
  slugify,
  shortUid,
  entitySlug,
  matchParam,
  findEntityByParam,
  RESERVED_SLUGS,
} from '@/lib/slugs';

describe('slugify', () => {
  it('normaliza acentos y espacios', () => {
    expect(slugify('Mi Área de Trabajo')).toBe('mi-area-de-trabajo');
  });

  it('quita caracteres especiales', () => {
    expect(slugify('Tareas!! [urgentes] (2026)')).toBe('tareas-urgentes-2026');
  });

  it('trunca a 50 caracteres', () => {
    const long = 'a'.repeat(80);
    expect(slugify(long).length).toBe(50);
  });

  it('fallback si queda vacío', () => {
    expect(slugify('!!!')).toBe('item');
  });
});

describe('shortUid', () => {
  it('quita guiones y toma 12 chars', () => {
    expect(shortUid('786083fe-e982-4649-9247-acbc5012eb88')).toBe(
      '786083fee982'
    );
  });
});

describe('entitySlug', () => {
  it('slug simple sin colisiones', () => {
    const siblings = [{ id: '1', name: 'Alpha', position: 0 }];
    expect(
      entitySlug({ id: '2', name: 'Mi Área', position: 1 }, siblings)
    ).toBe('mi-area');
  });

  it('sufijo determinista para slug colisionante de otro nombre', () => {
    const siblings = [
      { id: '1', name: 'Mi Área', position: 0 },
      { id: '2', name: 'mi-area', position: 1 },
    ];
    expect(entitySlug(siblings[0], siblings)).toBe('mi-area');
    expect(entitySlug(siblings[1], siblings)).toBe('mi-area-2');
  });

  it('escapa el slug reservado raiz', () => {
    const siblings = [{ id: '1', name: 'Raíz', position: 0 }];
    expect(entitySlug(siblings[0], siblings)).toBe('raiz-2');
    expect(RESERVED_SLUGS.has('raiz')).toBe(true);
  });
});

describe('matchParam', () => {
  const id = '786083fe-e982-4649-9247-acbc5012eb88';

  it('acepta UUID completo', () => {
    expect(matchParam(id, id, 'Mi Área')).toBe(true);
  });

  it('acepta prefijo corto', () => {
    expect(matchParam('786083fee982', id, 'Mi Área')).toBe(true);
  });

  it('acepta slug del nombre', () => {
    expect(matchParam('mi-area', id, 'Mi Área')).toBe(true);
  });

  it('rechaza otro slug', () => {
    expect(matchParam('otra-area', id, 'Mi Área')).toBe(false);
  });
});

describe('findEntityByParam', () => {
  const siblings = [
    { id: '1', name: 'Mi Área', position: 0 },
    { id: '2', name: 'mi-area', position: 1 },
    { id: '786083fe-e982-4649-9247-acbc5012eb88', name: 'Operaciones', position: 2 },
  ];

  it('resuelve por slug con sufijo', () => {
    expect(findEntityByParam('mi-area-2', siblings)?.id).toBe('2');
  });

  it('resuelve por prefijo corto', () => {
    expect(findEntityByParam('786083fee982', siblings)?.id).toBe(
      '786083fe-e982-4649-9247-acbc5012eb88'
    );
  });

  it('resuelve por slug simple', () => {
    expect(findEntityByParam('mi-area', siblings)?.id).toBe('1');
  });

  it('resuelve por uuid completo', () => {
    expect(
      findEntityByParam('786083fe-e982-4649-9247-acbc5012eb88', siblings)?.id
    ).toBe('786083fe-e982-4649-9247-acbc5012eb88');
  });

  it('devuelve undefined si no existe', () => {
    expect(findEntityByParam('no-existe', siblings)).toBeUndefined();
  });
});