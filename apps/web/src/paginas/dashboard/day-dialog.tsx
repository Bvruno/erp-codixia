"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { dayHours } from "@/lib/hours";
import type { Task, TimeEntry, StatusDef, PriorityDef } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  tasks: Task[];
  entries: TimeEntry[];
  statuses: StatusDef[];
  priorities: PriorityDef[];
  onOpenTask: (task: Task) => void;
  onCreateTask: () => void;
}

export function DayDialog({
  open,
  onOpenChange,
  date,
  tasks,
  entries,
  statuses,
  priorities,
  onOpenTask,
  onCreateTask,
}: Props) {
  if (!date) return null;
  const dateKey = format(date, "yyyy-MM-dd");
  const hours = dayHours(entries, dateKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {format(date, "EEEE, d 'de' MMMM", { locale: es })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {hours > 0 && (
            <p className="text-sm">
              <span
                className={`font-semibold ${
                  hours >= 8 ? "text-emerald-500" : "text-amber-500"
                }`}
              >
                {hours}h
              </span>{" "}
              registradas
            </p>
          )}
          {tasks.length === 0 ? (
            <EmptyState
              title="Sin tareas este día"
              description="Crea una tarea o muévela a esta fecha."
            />
          ) : (
            tasks.map((task) => {
              const status = statuses.find((s) => s.key === task.status);
              const priority = priorities.find((p) => p.key === task.priority);
              return (
                <button
                  key={task.id}
                  onClick={() => onOpenTask(task)}
                  className="w-full text-left rounded border px-2 py-1.5 text-sm transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: `${status?.color ?? "#94a3b8"}22`,
                    borderColor: `${status?.color ?? "#94a3b8"}44`,
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: priority?.color ?? "#94a3b8",
                      }}
                    />
                    <span className="font-medium truncate">{task.title}</span>
                    {task.assigned_profile?.full_name && (
                      <span className="text-muted-foreground text-xs ml-auto truncate">
                        {task.assigned_profile.full_name}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button onClick={onCreateTask}>Nueva tarea</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
