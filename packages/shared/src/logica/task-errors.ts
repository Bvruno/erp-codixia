export function friendlyTaskError(message: string): string {
  if (/duplicate key/i.test(message)) return 'Ya existe una tarea con ese nombre';
  if (/foreign key/i.test(message)) return 'La lista o la tarea padre ya no existe';
  if (/row-level security|permission denied/i.test(message)) return 'No tenés permiso para crear tareas aquí';
  if (/network|failed to fetch|load failed/i.test(message)) return 'Error de conexión';
  return 'No se pudo crear la tarea';
}