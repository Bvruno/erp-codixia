import { entitySlug, shortUid } from '@/lib/slugs';

export type ArbolTareas = {
  workspaces: { id: string; name: string }[];
  folders: { id: string; name: string; workspace_id: string }[];
  lists: { id: string; name: string; workspace_id: string; folder_id: string | null }[];
};

export type TareaConLista = {
  id: string;
  list_id: string | null;
};

/** Ruta del board (lista) de una tarea; null si no se puede resolver. */
export function rutaListaDeTarea(
  task: TareaConLista,
  arbol: ArbolTareas
): string | null {
  if (!task.list_id) return null;
  const lista = arbol.lists.find((l) => l.id === task.list_id);
  if (!lista) return null;

  const folder = lista.folder_id
    ? arbol.folders.find((f) => f.id === lista.folder_id) ?? null
    : null;
  const wsId = folder?.workspace_id ?? lista.workspace_id;
  const ws = arbol.workspaces.find((w) => w.id === wsId);
  if (!ws) return null;

  const folderSeg = folder ? entitySlug(folder, arbol.folders) : 'raiz';
  return `/proyectos/${entitySlug(ws, arbol.workspaces)}/${folderSeg}/${entitySlug(
    lista,
    arbol.lists
  )}`;
}

/** Ruta del detalle de la tarea (o /proyectos si falta contexto). */
export function rutaTarea(task: TareaConLista, arbol: ArbolTareas): string {
  const base = rutaListaDeTarea(task, arbol);
  const id = shortUid(task.id);
  return base ? `${base}/tarea/${id}` : '/proyectos';
}
