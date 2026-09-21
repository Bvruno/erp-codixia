'use client';

import { Folder, ListTodo, BookOpen, Network, ListChecks, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navBus } from '@/lib/nav-bus';
import type { Workspace, WorkspaceFolder, TaskList, TaskDocument, MindMap, Todo, Formulario } from '@/types';
import { RailBtn } from './filas';

// Rail lateral de workspaces (desktop colapsado): botones por entidad.

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
        <p className="px-1 py-3 text-center text-[10px] text-muted-foreground">
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
                <Folder className="size-4 text-blue-500" />
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
                  <Folder className="size-4 text-yellow-500" />
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
                  <ListTodo className="size-4 text-muted-foreground" />
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
                  <BookOpen className="size-4 text-indigo-500" />
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
                  <Network className="size-4 text-emerald-500" />
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
                  <ListChecks className="size-4 text-rose-500" />
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
                  <ClipboardList className="size-4 text-amber-500" />
                </RailBtn>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
