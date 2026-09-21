'use client';

import { TareasProvider, useTareas } from './tareas-context';
import { WorkspaceNav } from './workspace-nav';
import { EntityEditDialog } from './entity-edit-dialog';
import { ShareEntityDialog } from './share-entity-dialog';
import { EmptyWorkspaces } from './empty-workspaces';
import { TableSkeleton } from '@/components/ui/skeleton';

function TareasShell({ children }: { children: React.ReactNode }) {
  const ctx = useTareas();

  if (ctx.loading) {
    return (
      <div className="flex flex-col gap-4 lg:h-[calc(100dvh-3rem)] lg:flex-row">
        <div className="w-full rounded-md border lg:w-64 lg:shrink-0 lg:h-full">
          <div className="p-3 space-y-2">
            <div className="h-3 w-32 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted/60" />
            <div className="h-4 w-4/5 rounded bg-muted/60" />
            <div className="h-4 w-3/5 rounded bg-muted/60" />
          </div>
        </div>
        <div className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto">
          <TableSkeleton rows={5} cols={6} />
        </div>
      </div>
    );
  }

  if (!ctx.structureError && ctx.workspaces.length === 0) {
    return (
      <EmptyWorkspaces
        canManage={ctx.isAdmin}
        collaborators={ctx.collaborators.filter((c) => !c.is_owner)}
        onCreate={(input) =>
          ctx.onCreate({
            type: 'workspace',
            name: input.name,
            visibility: input.visibility,
            memberGrants: Object.entries(input.memberGrants).map(
              ([profileId, grant]) => ({
                profileId,
                permission: grant.permission,
                inherit: grant.inherit,
              })
            ),
          })
        }
      />
    );
  }

  return (
    <div className="space-y-4 print:space-y-0">
      {ctx.structureError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>Error de base de datos:</strong> {ctx.structureError}
          <span className="mt-1 block text-xs text-destructive/80">
            Revisa las migraciones en Supabase (0013-0015) y abre /debug → Inspeccionar DB.
          </span>
        </div>
      )}
      <div className="flex flex-col gap-4 lg:h-dvh lg:flex-row lg:gap-0 lg:-my-6 lg:-ml-6 print:block print:h-auto print:my-0 print:ml-0">
        <WorkspaceNav
          workspaces={ctx.workspaces}
          folders={ctx.folders}
          lists={ctx.lists}
          documents={ctx.documents}
          mindmaps={ctx.mindmaps}
          todos={ctx.todos}
          formularios={ctx.formularios}
          counts={ctx.counts}
          selectedListId={ctx.selectedListId}
          onSelectList={ctx.onSelectList}
          onOpenDashboard={ctx.onOpenDashboard}
          onOpenDocument={ctx.onOpenDocument}
          onOpenMindMap={ctx.onOpenMindMap}
          onOpenTodo={ctx.onOpenTodo}
          onOpenFormulario={ctx.onOpenFormulario}
          canManage={ctx.isAdmin}
          canManageEntity={ctx.canManageEntity}
          canWriteEntity={ctx.canWriteEntity}
          onCreate={ctx.onCreate}
          onOpenEdit={ctx.openEdit}
          collaborators={ctx.collaborators}
          onDelete={ctx.onDelete}
          onMoveEntity={ctx.onMoveEntity}
          onClone={ctx.onClone}
          onReorderTo={ctx.onReorderTo}
        />
        <div className="min-w-0 flex-1 space-y-4 lg:h-full lg:overflow-y-auto lg:pl-6 lg:pt-6 print:h-auto print:overflow-visible print:pl-0 print:pt-0">{children}</div>
      </div>
      <EntityEditDialog />
      <ShareEntityDialog />
    </div>
  );
}

export function TareasLayout({ children }: { children: React.ReactNode }) {
  return (
    <TareasProvider>
      <TareasShell>{children}</TareasShell>
    </TareasProvider>
  );
}
