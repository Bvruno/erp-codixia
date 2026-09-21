import { describe, expect, it } from 'vitest';
import { rutaListaDeTarea, rutaTarea, type ArbolTareas } from './rutas-tareas';

const ARBOL: ArbolTareas = {
  workspaces: [
    { id: 'ws-1', name: 'General' },
    { id: 'ws-2', name: 'Operaciones' },
  ],
  folders: [
    { id: 'f-1', name: 'Campañas', workspace_id: 'ws-2' },
    { id: 'f-2', name: 'Ads', workspace_id: 'ws-2' },
  ],
  lists: [
    { id: 'l-1', name: 'Tareas', workspace_id: 'ws-1', folder_id: null },
    { id: 'l-2', name: 'Redes', workspace_id: 'ws-2', folder_id: 'f-1' },
  ],
};

describe('rutaTarea', () => {
  it('arma la ruta de una lista sin carpeta con segmento raiz', () => {
    expect(rutaListaDeTarea({ id: 't-1', list_id: 'l-1' }, ARBOL)).toBe(
      '/proyectos/general/raiz/tareas'
    );
  });

  it('usa el slug de la carpeta cuando existe', () => {
    expect(rutaListaDeTarea({ id: 't-1', list_id: 'l-2' }, ARBOL)).toBe(
      '/proyectos/operaciones/campanas/redes'
    );
  });

  it('agrega el detalle con el uid corto', () => {
    const uuid = '12345678-90ab-cdef-1234-567890abcdef';
    expect(rutaTarea({ id: uuid, list_id: 'l-1' }, ARBOL)).toBe(
      '/proyectos/general/raiz/tareas/tarea/1234567890ab'
    );
  });

  it('cae a /proyectos si falta la lista o el workspace', () => {
    expect(rutaTarea({ id: 't-1', list_id: null }, ARBOL)).toBe('/proyectos');
    expect(rutaTarea({ id: 't-1', list_id: 'desconocida' }, ARBOL)).toBe('/proyectos');
  });
});
