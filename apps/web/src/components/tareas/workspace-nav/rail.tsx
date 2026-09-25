'use client';

import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navBus } from '@/lib/nav-bus';
import { ENTIDADES_META } from '@/lib/entidades-meta';
import type { Workspace, WorkspaceFolder, TaskList, TaskDocument, MindMap, Todo, Formulario } from '@/types';
import { RailBtn } from './filas';

// Rail lateral de workspaces (desktop colapsado): botones por entidad.

const ICONO_LISTA = ENTIDADES_META.list.icono;
const ICONO_DOCUMENTO = ENTIDADES_META.document.icono;
const ICONO_MAPA = ENTIDADES_META.mindmap.icono;
const ICONO_TODO = ENTIDADES_META.todo.icono;
const ICONO_FORMULARIO = ENTIDADES_META.formulario.icono;

export function RailNav({
  wsSorted,
  folders,
  lists,
  documents,
  mindmaps,
  todos,
  formularios,
  selectedListId,
  activeWsId,
  activeFolderId,
  activeDocId,
  activeMapId,
  activeTodoId,
  activeFormularioId,
  onOpenDashboard,
  onSelectList,
  onOpenDocument,
  onOpenMindMap,
  onOpenTodo,
  onOpenFormulario,
}: {
  wsSorted: Workspace[];
  folders: WorkspaceFolder[];
  lists: TaskList[];
  documents: TaskDocument[];
  mindmaps: MindMap[];
  todos: Todo[];
  formularios: Formulario[];
  selectedListId: string | null;
  activeWsId?: string;
  activeFolderId?: string;
  activeDocId?: string;
  activeMapId?: string;
  activeTodoId?: string;
  activeFormularioId?: string;
  onOpenDashboard: (scope: { type: 'workspace' | 'folder'; wsId: string; folderId?: string }) => void;
  onSelectList: (id: string) => void;
  onOpenDocument: (docId: string) => void;
  onOpenMindMap: (mapId: string) => void;
  onOpenTodo: (todoId: string) => void;
  onOpenFormulario: (formularioId: string) => void;
}) {
  return (
    <div className="hidden flex-1 flex-col gap-1 overflow-y-auto p-2 lg:flex">
      {wsSorted.length === 0 ? (
        <p className="px-1 py-3 text-center text-xs text-muted-foreground">
          Sin espacios
        </p>
      ) : (
        wsSorted.map((ws, wsIdx) => {
          const wsAllFolders = [...folders]
            .filter((f) => f.workspace_id === ws.id)
            .sort((a, b) => a.position - b.position);
          const wsAllLists = [...lists]
            .filter((l) => l.workspace_id === ws.id)
            .sort((a, b) => a.position - b.position);
          const wsAllDocs = [...documents]
            .filter((d) => d.workspace_id === ws.id)
            .sort((a, b) => a.position - b.position);
          const wsAllMaps = [...mindmaps]
            .filter((m) => m.workspace_id === ws.id)
            .sort((a, b) => a.position - b.position);
          const wsAllTodos = [...todos]
            .filter((t) => t.workspace_id === ws.id)
            .sort((a, b) => a.position - b.position);
          const wsAllFormularios = [...formularios]
            .filter((f) => f.workspace_id === ws.id)
            .sort((a, b) => a.position - b.position);
          return (
            <div
              key={ws.id}
              className={cn(
                'flex flex-col items-center gap-1',
                wsIdx > 0 && 'mt-1 border-t border-sidebar-border/70 pt-1.5',
              )}
            >
              <RailBtn
                title={ws.name}
                active={ws.id === activeWsId}
                onClick={() => {
                  onOpenDashboard({ type: 'workspace', wsId: ws.id });
                }}
              >
                <Folder className="size-4 text-muted-foreground" />
              </RailBtn>
              {wsAllFolders.map((f) => (
                <RailBtn
                  key={f.id}
                  title={f.name}
                  active={f.id === activeFolderId}
                  onClick={() => {
                    onOpenDashboard({ type: 'folder', wsId: ws.id, folderId: f.id });
                  }}
                >
                  <Folder className="size-4 text-muted-foreground" />
                </RailBtn>
              ))}
              {wsAllLists.map((l) => (
                <RailBtn
                  key={l.id}
                  title={l.name}
                  active={l.id === selectedListId}
                  onClick={() => {
                    onSelectList(l.id);
                    navBus.closeDrawer();
                  }}
                >
                  <ICONO_LISTA className={cn('size-4', ENTIDADES_META.list.color)} />
                </RailBtn>
              ))}
              {wsAllDocs.map((d) => (
                <RailBtn
                  key={d.id}
                  title={d.name}
                  active={d.id === activeDocId}
                  onClick={() => {
                    onOpenDocument(d.id);
                    navBus.closeDrawer();
                  }}
                >
                  <ICONO_DOCUMENTO className={cn('size-4', ENTIDADES_META.document.color)} />
                </RailBtn>
              ))}
              {wsAllMaps.map((m) => (
                <RailBtn
                  key={m.id}
                  title={m.name}
                  active={m.id === activeMapId}
                  onClick={() => {
                    onOpenMindMap(m.id);
                    navBus.closeDrawer();
                  }}
                >
                  <ICONO_MAPA className={cn('size-4', ENTIDADES_META.mindmap.color)} />
                </RailBtn>
              ))}
              {wsAllTodos.map((t) => (
                <RailBtn
                  key={t.id}
                  title={t.name}
                  active={t.id === activeTodoId}
                  onClick={() => {
                    onOpenTodo(t.id);
                    navBus.closeDrawer();
                  }}
                >
                  <ICONO_TODO className={cn('size-4', ENTIDADES_META.todo.color)} />
                </RailBtn>
              ))}
              {wsAllFormularios.map((f) => (
                <RailBtn
                  key={f.id}
                  title={f.name}
                  active={f.id === activeFormularioId}
                  onClick={() => {
                    onOpenFormulario(f.id);
                    navBus.closeDrawer();
                  }}
                >
                  <ICONO_FORMULARIO className={cn('size-4', ENTIDADES_META.formulario.color)} />
                </RailBtn>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
