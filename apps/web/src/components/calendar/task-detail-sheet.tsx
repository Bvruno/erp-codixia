'use client';

import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { TaskDetail } from '@/components/tareas/task-detail';
import type { AccessTree } from '@/lib/access';
import type { Profile } from '@/types';

/**
 * Detalle de tarea en offcanvas (layout tipo dashboard, reutilizado de la
 * página `/tareas/:id`). Se usa fuera de `/proyectos`, donde no existe
 * `TareasProvider`: el árbol y los permisos llegan por props.
 */
export function TaskDetailSheet({
  taskId,
  open,
  onClose,
  rutaCompleta,
  arbol,
  colaboradores,
  esAdmin,
  listasEscribibles,
  onChanged,
  onDeleted,
  onOpenTask,
  onBack,
  noModal = false,
}: {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  rutaCompleta?: string | null;
  arbol?: AccessTree;
  colaboradores?: Profile[];
  esAdmin?: boolean;
  listasEscribibles?: string[] | null;
  onChanged?: () => void;
  onDeleted?: () => void;
  /** Cambia el contenido del panel al pulsar una sub-tarea. */
  onOpenTask?: (id: string) => void;
  /** Presente cuando hay una tarea anterior en la pila: muestra "atrás". */
  onBack?: () => void;
  /** Sin overlay ni bloqueo del resto de la pantalla: se puede seguir
   *  interactuando con la vista y cambiar de tarea sin cerrar el panel. */
  noModal?: boolean;
}) {
  const router = useRouter();

  return (
    <Sheet
      open={open}
      modal={noModal ? false : undefined}
      onOpenChange={(next) => !next && onClose()}
    >
      <SheetContent
        side="right"
        overlay={!noModal}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl lg:max-w-5xl"
      >
        <SheetHeader className="shrink-0 flex-row items-center gap-2 border-b px-4 py-3 pr-14 text-left">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={onBack}
              title="Volver a la tarea anterior"
              aria-label="Volver a la tarea anterior"
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <SheetTitle className="text-sm font-semibold text-muted-foreground">
            Detalle de tarea
          </SheetTitle>
          <SheetDescription className="sr-only">
            Detalle completo de la tarea seleccionada.
          </SheetDescription>
          {rutaCompleta && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto px-2"
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
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {taskId && (
            <TaskDetail
              key={taskId}
              taskId={taskId}
              onClose={onClose}
              onDeleted={onDeleted ?? onClose}
              onChanged={onChanged}
              arbol={arbol}
              colaboradores={colaboradores}
              esAdmin={esAdmin}
              listasEscribibles={listasEscribibles}
              onOpenTask={onOpenTask}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
