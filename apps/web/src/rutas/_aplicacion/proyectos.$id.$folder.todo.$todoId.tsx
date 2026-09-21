import { createFileRoute, useParams } from '@tanstack/react-router';
import { ToDoView } from '@/components/tareas/todo-view';

export const Route = createFileRoute(
  '/_aplicacion/proyectos/$id/$folder/todo/$todoId'
)({
  component: Todo,
});

function Todo() {
  const { todoId } = useParams({ from: Route.id });
  return <ToDoView todoId={todoId} />;
}