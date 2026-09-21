import { createFileRoute, useParams } from '@tanstack/react-router';
import { TaskDetail } from '@/components/tareas/task-detail';

export const Route = createFileRoute(
  '/_aplicacion/proyectos/$id/$folder/$list/tarea/$taskId'
)({
  component: TareaDetalle,
});

function TareaDetalle() {
  const { taskId } = useParams({ from: Route.id });
  return <TaskDetail taskId={taskId} />;
}