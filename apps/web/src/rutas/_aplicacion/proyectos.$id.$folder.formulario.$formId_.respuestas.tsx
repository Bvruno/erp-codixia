import { createFileRoute, useParams } from '@tanstack/react-router';
import { RespuestasView } from '@/components/formularios/respuestas-view';

export const Route = createFileRoute(
  '/_aplicacion/proyectos/$id/$folder/formulario/$formId_/respuestas'
)({
  component: Respuestas,
});

function Respuestas() {
  const { formId } = useParams({ from: Route.id });
  return <RespuestasView formularioId={formId} />;
}
