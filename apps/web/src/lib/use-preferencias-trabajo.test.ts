import { describe, expect, it } from 'vitest';
import {
  diasLaborablesEfectivos,
  esDiaLaborable,
} from './use-preferencias-trabajo';

describe('diasLaborablesEfectivos', () => {
  it('usa la preferencia cuando tiene días', () => {
    expect(diasLaborablesEfectivos([0, 6])).toEqual([0, 6]);
    expect(diasLaborablesEfectivos([5, 1, 3])).toEqual([1, 3, 5]);
  });

  it('cae a lunes-viernes si está vacía o ausente', () => {
    expect(diasLaborablesEfectivos([])).toEqual([1, 2, 3, 4, 5]);
    expect(diasLaborablesEfectivos(null)).toEqual([1, 2, 3, 4, 5]);
    expect(diasLaborablesEfectivos(undefined)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('esDiaLaborable', () => {
  it('responde según los días efectivos', () => {
    expect(esDiaLaborable(1, [1, 2, 3, 4, 5])).toBe(true);
    expect(esDiaLaborable(0, [1, 2, 3, 4, 5])).toBe(false);
    expect(esDiaLaborable(0, [])).toBe(false);
    expect(esDiaLaborable(6, [0, 6])).toBe(true);
  });
});
