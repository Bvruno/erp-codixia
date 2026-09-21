import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('concatena clases simples', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('filtra falsy', () => {
    expect(cn('a', null, undefined, false, 'b')).toBe('a b');
  });

  it('soporta objetos condicionales de clsx', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  it('mergea conflictos de tailwind (gana el último)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('mantiene clases de grupos distintos', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });
});
