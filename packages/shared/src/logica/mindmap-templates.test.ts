import { describe, it, expect } from 'vitest';
import { getTemplate, MIND_MAP_TEMPLATES } from '@/lib/mindmap-templates';
import { validateSnapshot } from '@/lib/mindmap';

describe('mindmap templates', () => {
  it('cada template construye un snapshot íntegro', () => {
    expect(MIND_MAP_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    MIND_MAP_TEMPLATES.forEach((t) => {
      const snap = t.build();
      const res = validateSnapshot(snap);
      expect(res, `${t.id}: ${res.issues.join('; ')}`).toMatchObject({ ok: true });
    });
  });

  it('las ramas de lluvia de ideas están conectadas al centro', () => {
    const snap = getTemplate('lluvia').build();
    const branchIds = snap.nodes.filter((n) => n.id !== 'n-center').map((n) => n.id);
    branchIds.forEach((id) => {
      expect(snap.edges.some((e) => e.source === 'n-center' && e.target === id)).toBe(true);
    });
  });

  it('la plantilla DAFO usa cuadrantes coloreados', () => {
    const snap = getTemplate('dafo').build();
    expect(snap.nodes.find((n) => n.data.label === 'Fortalezas')?.data.color).toBe('#10b981');
    expect(snap.nodes.find((n) => n.data.label === 'Amenazas')?.data.color).toBe('#f59e0b');
  });

  it('blank devuelve lienzo vacío', () => {
    const snap = getTemplate('blank').build();
    expect(snap.nodes).toHaveLength(0);
    expect(snap.edges).toHaveLength(0);
  });

  it('getTemplate cae a blank con id desconocido', () => {
    expect(getTemplate('nope').id).toBe('blank');
    expect(getTemplate(null).id).toBe('blank');
  });
});