'use client';

import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { TaskDetail } from '@/components/tareas/task-detail';
import type { AccessTree } from '@/lib/access';
import type { Profile } from '@/types';

/**
 * Detalle de tarea en modal (layout tipo dashboard, reutilizado de la
 * página `/tareas/:id`). Se usa fuera de `/proyectos`, donde no existe
 * `TareasProvider`: el árbol y los permisos llegan por props.
 */
export function TaskDetailModal({
  taskId,
  open,
  onClose,
  rutaCompleta,
  arbol,
  colaboradores,
  esAdmin,
  listasEscribibles,
  onChanged,
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  rutaCompleta?: string | null;
  arbol: AccessTree;
  colaboradores: Profile[];
  esAdmin: boolean;
  listasEscribibles: string[] | null;
  onChanged?: () => void;
}) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-6xl sm:p-6">
        <DialogHeader className="flex-row items-center justify-between gap-2 text-left">
          <DialogTitle className="text-sm font-semibold text-muted-foreground">
            Detalle de tarea
          </DialogTitle>
          {rutaCompleta && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-8 px-2"
              onClick={() => {
                onClose();
                router.push(rutaCompleta);
              }}
              title="Abrir la página completa de la tarea"
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">Página completa</span>
            </Button>
          )}
        </DialogHeader>
        {taskId && (
          <TaskDetail
            key={taskId}
            taskId={taskId}
            onClose={onClose}
            onDeleted={onClose}
            onChanged={onChanged}
            arbol={arbol}
            colaboradores={colaboradores}
            esAdmin={esAdmin}
            listasEscribibles={listasEscribibles}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
