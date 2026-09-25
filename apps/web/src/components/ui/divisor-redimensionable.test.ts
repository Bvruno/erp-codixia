import { describe, expect, it } from 'vitest';
import {
  ANCHO_PAGINAS_DEFECTO,
  ANCHO_PAGINAS_MAX,
  ANCHO_PAGINAS_MIN,
  PASO_TECLADO,
  anchoTrasTecla,
  clampAncho,
} from './divisor-redimensionable';

describe('clampAncho', () => {
  it('respeta los límites', () => {
    expect(clampAncho(50)).toBe(ANCHO_PAGINAS_MIN);
    expect(clampAncho(9999)).toBe(ANCHO_PAGINAS_MAX);
    expect(clampAncho(240)).toBe(240);
  });

  it('redondea y cae al default con valores inválidos', () => {
    expect(clampAncho(240.6)).toBe(241);
    expect(clampAncho(Number.NaN)).toBe(ANCHO_PAGINAS_DEFECTO);
    expect(clampAncho(Number.POSITIVE_INFINITY)).toBe(ANCHO_PAGINAS_DEFECTO);
  });
});

describe('anchoTrasTecla', () => {
  it('ajusta con las flechas dentro de los límites', () => {
    expect(anchoTrasTecla(240, 'ArrowRight')).toBe(240 + PASO_TECLADO);
    expect(anchoTrasTecla(240, 'ArrowLeft')).toBe(240 - PASO_TECLADO);
    expect(anchoTrasTecla(ANCHO_PAGINAS_MAX, 'ArrowRight')).toBe(ANCHO_PAGINAS_MAX);
    expect(anchoTrasTecla(ANCHO_PAGINAS_MIN, 'ArrowLeft')).toBe(ANCHO_PAGINAS_MIN);
  });

  it('Home y End van a los extremos', () => {
    expect(anchoTrasTecla(240, 'Home')).toBe(ANCHO_PAGINAS_MIN);
    expect(anchoTrasTecla(240, 'End')).toBe(ANCHO_PAGINAS_MAX);
  });

  it('devuelve null para otras teclas', () => {
    expect(anchoTrasTecla(240, 'Enter')).toBeNull();
    expect(anchoTrasTecla(240, 'a')).toBeNull();
  });
});
