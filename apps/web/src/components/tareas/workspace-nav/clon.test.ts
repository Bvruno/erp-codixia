import { describe, it, expect } from 'vitest';
import { nombreClonUnico } from './clon';

describe('nombreClonUnico', () => {
  it('usa "Copia de X" cuando no hay colisión', () => {
    expect(nombreClonUnico('Ventas', ['Compras'])).toBe('Copia de Ventas');
  });

  it('agrega sufijo incremental si ya existe', () => {
    expect(nombreClonUnico('Ventas', ['Copia de Ventas'])).toBe('Copia de Ventas 2');
    expect(nombreClonUnico('Ventas', ['Copia de Ventas', 'Copia de Ventas 2'])).toBe(
      'Copia de Ventas 3'
    );
  });

  it('ignora mayúsculas y espacios al comparar', () => {
    expect(nombreClonUnico('Ventas', ['  copia de ventas  '])).toBe('Copia de Ventas 2');
  });
});
