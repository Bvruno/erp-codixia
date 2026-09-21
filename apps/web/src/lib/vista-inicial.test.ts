import { describe, expect, it } from 'vitest';
import { rutaVistaPorDefecto, RUTA_POR_VISTA } from './vista-inicial';

describe('rutaVistaPorDefecto', () => {
  it('mapea cada vista a su ruta', () => {
    expect(rutaVistaPorDefecto('calendario')).toBe('/calendario');
    expect(rutaVistaPorDefecto('proyectos')).toBe('/proyectos');
    expect(rutaVistaPorDefecto('pipeline')).toBe('/pipeline');
  });

  it('cae a calendario con valores ausentes o desconocidos', () => {
    expect(rutaVistaPorDefecto(null)).toBe('/calendario');
    expect(rutaVistaPorDefecto(undefined)).toBe('/calendario');
    expect(
      rutaVistaPorDefecto('otra' as unknown as keyof typeof RUTA_POR_VISTA),
    ).toBe('/calendario');
  });
});
