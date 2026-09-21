import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATUSES,
  DEFAULT_PRIORITIES,
  resolveStatuses,
  resolvePriorities,
  statusMap,
  priorityMap,
  statusLabel,
  priorityLabel,
  hiddenStatuses,
  statusStyle,
  dotStyle,
  unionConfig,
} from '@/lib/task-config';

const customStatuses = [{ key: 'custom', label: 'Custom', color: '#123456' }];
const customPriorities = [{ key: 'p1', label: 'P1', color: '#111111' }];

describe('resolveStatuses / resolvePriorities', () => {
  it('usa defaults con null, undefined o array vacío', () => {
    expect(resolveStatuses(null)).toBe(DEFAULT_STATUSES);
    expect(resolveStatuses(undefined)).toBe(DEFAULT_STATUSES);
    expect(resolveStatuses([])).toBe(DEFAULT_STATUSES);
  });

  it('usa el array custom si tiene elementos', () => {
    expect(resolveStatuses(customStatuses)).toBe(customStatuses);
    expect(resolvePriorities(customPriorities)).toBe(customPriorities);
  });
});

describe('maps', () => {
  it('statusMap y priorityMap indexan por key', () => {
    expect(statusMap(DEFAULT_STATUSES).get('done')?.label).toBe('Completado');
    expect(priorityMap(DEFAULT_PRIORITIES).get('urgent')?.color).toBe('#ef4444');
  });
});

describe('labels', () => {
  it('statusLabel y priorityLabel devuelven fallback de la key', () => {
    expect(statusLabel(DEFAULT_STATUSES, 'todo')).toBe('Pendiente');
    expect(statusLabel(DEFAULT_STATUSES, 'inexistente')).toBe('inexistente');
    expect(priorityLabel(DEFAULT_PRIORITIES, 'low')).toBe('Baja');
    expect(priorityLabel(DEFAULT_PRIORITIES, 'zzz')).toBe('zzz');
  });
});

describe('hiddenStatuses', () => {
  it('colecta estados ocultos por defecto', () => {
    const hidden = hiddenStatuses(DEFAULT_STATUSES);
    expect(hidden.has('done')).toBe(true);
    expect(hidden.has('cancelled')).toBe(true);
    expect(hidden.has('todo')).toBe(false);
  });
});

describe('styles', () => {
  it('statusStyle genera tono translúcido sobre el color base', () => {
    const s = statusStyle('#ff0000');
    expect(s.backgroundColor).toBe('#ff00001A');
    expect(s.borderColor).toBe('#ff000040');
    expect(s.color).toBe('#ff0000');
  });

  it('dotStyle usa el color directo', () => {
    expect(dotStyle('#00ff00')).toEqual({ backgroundColor: '#00ff00' });
  });
});

describe('unionConfig', () => {
  it('fusiona configs deduplicando por key', () => {
    const { statuses, priorities } = unionConfig([
      { statuses: customStatuses, priorities: customPriorities },
      { statuses: customStatuses, priorities: customPriorities },
    ]);
    expect(statuses).toEqual(customStatuses);
    expect(priorities).toEqual(customPriorities);
  });

  it('mezcla listas con configs distintas', () => {
    const extra = [{ key: 'extra', label: 'Extra', color: '#222222' }];
    const { statuses } = unionConfig([{ statuses: customStatuses }, { statuses: extra }]);
    expect(statuses).toHaveLength(2);
    expect(statuses.map((s) => s.key)).toEqual(['custom', 'extra']);
  });

  it('cae a defaults cuando todo está vacío', () => {
    const { statuses, priorities } = unionConfig([{}, {}]);
    expect(statuses).toEqual(DEFAULT_STATUSES);
    expect(priorities).toEqual(DEFAULT_PRIORITIES);
  });
});
