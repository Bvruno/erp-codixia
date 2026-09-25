import {
  BookOpen,
  ClipboardList,
  Folder,
  LayoutGrid,
  ListChecks,
  ListTodo,
  Network,
  SquareCheckBig,
  type LucideIcon,
} from 'lucide-react';

// Metadatos visuales de cada tipo de entidad del frontend. Fuente única para
// icono, color, etiqueta y placeholder (cabeceras, navegación, diálogos).

export type TipoEntidadUI =
  | 'workspace'
  | 'folder'
  | 'list'
  | 'tarea'
  | 'document'
  | 'mindmap'
  | 'todo'
  | 'formulario';

export interface MetaEntidad {
  etiqueta: string;
  etiquetaCrear: string;
  icono: LucideIcon;
  color: string;
  placeholder: string;
}

export const ENTIDADES_META: Record<TipoEntidadUI, MetaEntidad> = {
  workspace: {
    etiqueta: 'espacio de trabajo',
    etiquetaCrear: 'Nuevo espacio de trabajo',
    icono: LayoutGrid,
    color: 'text-muted-foreground',
    placeholder: 'Nombre del espacio',
  },
  folder: {
    etiqueta: 'carpeta',
    etiquetaCrear: 'Nueva carpeta de trabajo',
    icono: Folder,
    color: 'text-muted-foreground',
    placeholder: 'Nombre de la carpeta',
  },
  list: {
    etiqueta: 'lista',
    etiquetaCrear: 'Nueva lista',
    icono: ListTodo,
    color: 'text-muted-foreground',
    placeholder: 'Nombre de la lista',
  },
  tarea: {
    etiqueta: 'tarea',
    etiquetaCrear: 'Nueva tarea',
    icono: SquareCheckBig,
    color: 'text-muted-foreground',
    placeholder: 'Título de la tarea',
  },
  document: {
    etiqueta: 'documento',
    etiquetaCrear: 'Nuevo documento',
    icono: BookOpen,
    color: 'text-muted-foreground',
    placeholder: 'Nombre del documento',
  },
  mindmap: {
    etiqueta: 'mapa mental',
    etiquetaCrear: 'Nuevo mapa mental',
    icono: Network,
    color: 'text-muted-foreground',
    placeholder: 'Nombre del mapa',
  },
  todo: {
    etiqueta: 'TO-DO',
    etiquetaCrear: 'Nuevo TO-DO',
    icono: ListChecks,
    color: 'text-muted-foreground',
    placeholder: 'Nombre del TO-DO',
  },
  formulario: {
    etiqueta: 'formulario',
    etiquetaCrear: 'Nuevo formulario',
    icono: ClipboardList,
    color: 'text-muted-foreground',
    placeholder: 'Nombre del formulario',
  },
};

export function metaEntidad(tipo: TipoEntidadUI): MetaEntidad {
  return ENTIDADES_META[tipo];
}
