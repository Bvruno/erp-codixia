'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Folder, LayoutGrid, ListTodo, Search, Check, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AccessTree } from '@/lib/access';
import type { EntityType } from '@/types';

export type ScopeSelection = { type: EntityType; id: string; name: string } | null;

const TYPE_OPTIONS: { value: EntityType; label: string; icon: React.ReactNode }[] = [
  { value: 'workspace', label: 'Área', icon: <LayoutGrid className="size-3.5" /> },
  { value: 'folder', label: 'Carpeta', icon: <Folder className="size-3.5" /> },
  { value: 'list', label: 'Lista', icon: <ListTodo className="size-3.5" /> },
  { value: 'document', label: 'Documento', icon: <BookOpen className="size-3.5" /> },
];

type FlatNode = {
  type: EntityType;
  id: string;
  name: string;
  depth: number;
  path: string;
};

export function EntityScopePicker({
  tree,
  type,
  onTypeChange,
  value,
  onChange,
}: {
  tree: AccessTree;
  type: EntityType;
  onTypeChange: (type: EntityType) => void;
  value: ScopeSelection;
  onChange: (sel: ScopeSelection) => void;
}) {
  const [search, setSearch] = useState('');

  const nodes = useMemo<FlatNode[]>(() => {
    const out: FlatNode[] = [];
    const wsName = (id: string) => tree.workspaces.find((w) => w.id === id)?.name || 'Área';

    const folderPath = (folderId: string, wsId: string): string => {
      const parts: string[] = [];
      let f = tree.folders.find((x) => x.id === folderId) ?? null;
      while (f) {
        const cur = f;
        parts.unshift(cur.name);
        const parentId = cur.parent_folder_id;
        f = parentId ? tree.folders.find((x) => x.id === parentId) ?? null : null;
      }
      return [wsName(wsId), ...parts].join(' > ');
    };

    const push = (t: EntityType, id: string, name: string, depth: number, path: string) => {
      if (t !== type) return;
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return;
      out.push({ type: t, id, name, depth, path });
    };

    tree.workspaces.forEach((ws) => push('workspace', ws.id, ws.name, 0, ws.name));

    const addFolder = (folder: { id: string; name: string; workspace_id: string; parent_folder_id: string | null }, depth: number) => {
      push('folder', folder.id, folder.name, depth, folderPath(folder.id, folder.workspace_id));
      tree.folders
        .filter((f) => f.parent_folder_id === folder.id)
        .sort((a, b) => a.position - b.position)
        .forEach((child) => addFolder(child, depth + 1));
    };

    tree.folders
      .filter((f) => !f.parent_folder_id)
      .sort((a, b) => a.position - b.position)
      .forEach((f) => addFolder(f, 1));

    tree.lists
      .filter((l) => !l.folder_id)
      .sort((a, b) => a.position - b.position)
      .forEach((l) => push('list', l.id, l.name, 1, `${wsName(l.workspace_id)} > ${l.name}`));

    tree.lists
      .filter((l) => l.folder_id)
      .sort((a, b) => a.position - b.position)
      .forEach((l) => {
        const folder = tree.folders.find((f) => f.id === l.folder_id);
        if (!folder) return;
        const depth = folderPath(l.folder_id!, l.workspace_id).split(' > ').length;
        push('list', l.id, l.name, depth, folderPath(l.folder_id!, l.workspace_id) + ` > ${l.name}`);
      });

    tree.documents
      .filter((d) => !d.folder_id)
      .sort((a, b) => a.position - b.position)
      .forEach((d) => push('document', d.id, d.name, 1, `${wsName(d.workspace_id)} > ${d.name}`));

    tree.documents
      .filter((d) => d.folder_id)
      .sort((a, b) => a.position - b.position)
      .forEach((d) => {
        const folder = tree.folders.find((f) => f.id === d.folder_id);
        if (!folder) return;
        push('document', d.id, d.name, folderPath(d.folder_id!, d.workspace_id).split(' > ').length, folderPath(d.folder_id!, d.workspace_id) + ` > ${d.name}`);
      });

    return out;
  }, [tree, type, search]);

  const iconFor = (t: EntityType) =>
    t === 'workspace' ? <LayoutGrid className="size-3.5 text-blue-500" />
      : t === 'folder' ? <Folder className="size-3.5 text-yellow-500" />
      : t === 'list' ? <ListTodo className="size-3.5 text-muted-foreground" />
      : <BookOpen className="size-3.5 text-indigo-500" />;

  const selected = value && value.type === type ? value : null;

  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-md border p-0.5">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onTypeChange(opt.value);
              onChange(null);
            }}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors',
              type === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-3.5" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="h-8 pl-8 text-sm"
        />
      </div>

      <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-md border p-1">
        {nodes.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Sin resultados
          </p>
        ) : (
          nodes.map((n) => {
            const isSelected = selected?.id === n.id;
            return (
              <button
                key={`${n.type}:${n.id}`}
                type="button"
                onClick={() =>
                  onChange({ type: n.type, id: n.id, name: n.name })
                }
                title={n.path}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  isSelected
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
                style={{ paddingLeft: `${8 + n.depth * 14}px` }}
              >
                {n.type !== 'workspace' && n.type !== 'folder' && (
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />
                )}
                {iconFor(n.type)}
                <span className="min-w-0 flex-1 truncate">{n.name}</span>
                {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
              </button>
            );
          })
        )}
      </div>

      {selected && (
        <p className="text-muted-foreground text-xs truncate">
          Seleccionado: <span className="text-foreground font-medium">{selected.name}</span>
        </p>
      )}
    </div>
  );
}
