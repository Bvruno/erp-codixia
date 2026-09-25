import { describe, it, expect } from 'vitest';
import {
  PERM_RANK,
  effectiveLevelOf,
  computeEffectiveLevel,
  effectiveAccessEntries,
  visibilityOf,
  type AccessTree,
} from '@/lib/access';
import type { EntityGrant } from '@/types';
import { AJUSTES_FORMULARIO_DEFAULT } from '@/types';

const grant = (
  entity_type: EntityGrant['entity_type'],
  entity_id: string,
  permission: EntityGrant['permission'],
  inherit = true,
): EntityGrant => ({
  entity_type,
  entity_id,
  profile_id: 'u1',
  permission,
  inherit,
  created_at: '',
});

const tree: AccessTree = {
  workspaces: [{ id: 'ws1', organization_id: 'org1', name: 'General', position: 0, visibility: 'restricted', default_statuses: null, default_priorities: null, created_at: '' }],
  folders: [
    { id: 'f1', workspace_id: 'ws1', parent_folder_id: null, name: 'Carpeta 1', position: 0, visibility: 'restricted', created_at: '' },
    { id: 'f2', workspace_id: 'ws1', parent_folder_id: 'f1', name: 'Subcarpeta', position: 0, visibility: 'restricted', created_at: '' },
  ],
  lists: [
    { id: 'l1', workspace_id: 'ws1', organization_id: 'org1', folder_id: 'f2', name: 'Lista 1', position: 0, visibility: 'restricted', statuses: null, priorities: null, created_at: '' },
    { id: 'l2', workspace_id: 'ws1', organization_id: 'org1', folder_id: null, name: 'Lista raíz', position: 1, visibility: 'restricted', statuses: null, priorities: null, created_at: '' },
  ],
  documents: [
    { id: 'd1', organization_id: 'org1', workspace_id: 'ws1', folder_id: 'f1', name: 'Doc 1', visibility: 'restricted', position: 0, created_at: '' },
    { id: 'd2', organization_id: 'org1', workspace_id: 'ws1', folder_id: 'f1', name: 'Doc privado', visibility: 'private', position: 1, created_at: '' },
  ],
  mindmaps: [
    { id: 'm1', organization_id: 'org1', workspace_id: 'ws1', folder_id: 'f1', name: 'Mapa 1', visibility: 'restricted', content: null, position: 0, created_by: null, created_at: '', updated_at: '' },
  ],
  todos: [
    { id: 't1', organization_id: 'org1', workspace_id: 'ws1', folder_id: 'f1', name: 'TO-DO 1', visibility: 'restricted', position: 0, created_by: null, created_at: '', updated_at: '' },
  ],
  formularios: [
    { id: 'fo1', organization_id: 'org1', workspace_id: 'ws1', folder_id: 'f1', name: 'Formulario 1', description: null, visibility: 'restricted', estado: 'borrador', position: 0, esquema: { version: 1, secciones: [] }, ajustes: AJUSTES_FORMULARIO_DEFAULT, publicado_at: null, created_by: null, created_at: '', updated_at: '' },
  ],
};

describe('PERM_RANK', () => {
  it('ordena read < write < manage', () => {
    expect(PERM_RANK.read).toBe(1);
    expect(PERM_RANK.write).toBe(2);
    expect(PERM_RANK.manage).toBe(3);
  });
});

describe('effectiveLevelOf', () => {
  it('devuelve null sin grants', () => {
    expect(effectiveLevelOf([], tree, 'list', 'l1')).toBeNull();
  });

  it('usa el grant directo del tipo consultado', () => {
    const res = effectiveLevelOf([grant('list', 'l1', 'write')], tree, 'list', 'l1');
    expect(res?.level).toBe('write');
    expect(res?.source.id).toBe('l1');
  });

  it('hereda permiso del workspace hacia la lista, capado a write', () => {
    const res = effectiveLevelOf([grant('workspace', 'ws1', 'manage')], tree, 'list', 'l1');
    expect(res?.level).toBe('write');
    expect(res?.source.type).toBe('workspace');
  });

  it('hereda a través de la cadena de carpetas', () => {
    const res = effectiveLevelOf([grant('folder', 'f1', 'read')], tree, 'list', 'l1');
    expect(res?.level).toBe('read');
    expect(res?.source.id).toBe('f1');
  });

  it('no hereda grants con inherit=false', () => {
    const res = effectiveLevelOf([grant('workspace', 'ws1', 'manage', false)], tree, 'list', 'l1');
    expect(res).toBeNull();
  });

  it('el grant directo gana sobre el heredado', () => {
    const res = effectiveLevelOf(
      [grant('workspace', 'ws1', 'read'), grant('list', 'l1', 'write')],
      tree,
      'list',
      'l1',
    );
    expect(res?.level).toBe('write');
  });

  it('para el tipo folder no consulta carpeta raíz como ancestro', () => {
    const res = effectiveLevelOf([grant('folder', 'f1', 'manage')], tree, 'folder', 'f1');
    expect(res?.level).toBe('manage');
  });

  it('para folder anidada hereda del padre', () => {
    const res = effectiveLevelOf([grant('folder', 'f1', 'read')], tree, 'folder', 'f2');
    expect(res?.level).toBe('read');
  });
});

describe('mindmap', () => {
  it('usa el grant directo del mapa', () => {
    const res = effectiveLevelOf([grant('mindmap', 'm1', 'write')], tree, 'mindmap', 'm1');
    expect(res?.level).toBe('write');
    expect(res?.source.id).toBe('m1');
  });

  it('hereda del workspace, capado a write', () => {
    const res = effectiveLevelOf([grant('workspace', 'ws1', 'manage')], tree, 'mindmap', 'm1');
    expect(res?.level).toBe('write');
    expect(res?.source.type).toBe('workspace');
  });

  it('hereda de la carpeta contenedora', () => {
    const res = effectiveLevelOf([grant('folder', 'f1', 'read')], tree, 'mindmap', 'm1');
    expect(res?.level).toBe('read');
    expect(res?.source.id).toBe('f1');
  });

  it('no hereda grants con inherit=false', () => {
    expect(effectiveLevelOf([grant('folder', 'f1', 'write', false)], tree, 'mindmap', 'm1')).toBeNull();
  });
});

describe('computeEffectiveLevel', () => {
  it('resume el nivel o null', () => {
    expect(computeEffectiveLevel([], tree, 'workspace', 'ws1')).toBeNull();
    expect(computeEffectiveLevel([grant('workspace', 'ws1', 'write')], tree, 'workspace', 'ws1')).toBe('write');
  });
});

describe('effectiveAccessEntries', () => {
  it('lista entidades con nivel efectivo y ruta legible', () => {
    const entries = effectiveAccessEntries([grant('workspace', 'ws1', 'read')], tree);
    expect(entries).toHaveLength(9);
    const list = entries.find((e) => e.id === 'l1');
    expect(list?.path).toBe('General > Carpeta 1 > Subcarpeta > Lista 1');
    expect(list?.explicit).toBe(false);
    expect(entries.find((e) => e.id === 'ws1')?.explicit).toBe(true);
    expect(entries.find((e) => e.id === 't1')?.path).toBe('General > Carpeta 1 > TO-DO 1');
    expect(entries.find((e) => e.id === 'fo1')?.path).toBe('General > Carpeta 1 > Formulario 1');
  });
});

describe('visibilidad y entidades privadas', () => {
  it('expone la visibilidad por tipo', () => {
    expect(visibilityOf(tree, 'document', 'd2')).toBe('private');
    expect(visibilityOf(tree, 'folder', 'f1')).toBe('restricted');
    expect(visibilityOf(tree, 'document', 'inexistente')).toBeNull();
  });

  it('una entidad privada no hereda grants de ancestros', () => {
    expect(effectiveLevelOf([grant('workspace', 'ws1', 'manage')], tree, 'document', 'd2')).toBeNull();
    expect(effectiveLevelOf([grant('folder', 'f1', 'manage')], tree, 'document', 'd2')).toBeNull();
  });

  it('una entidad privada sí recibe su grant directo', () => {
    const res = effectiveLevelOf([grant('document', 'd2', 'manage')], tree, 'document', 'd2');
    expect(res?.level).toBe('manage');
  });

  it('las entidades privadas sin grant directo no aparecen en accesos efectivos', () => {
    const entries = effectiveAccessEntries([grant('workspace', 'ws1', 'read')], tree);
    expect(entries.find((e) => e.id === 'd2')).toBeUndefined();
  });
});
