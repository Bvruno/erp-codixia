import { createFileRoute, useParams } from '@tanstack/react-router';
import { FormularioView } from '@/components/formularios/formulario-view';

export const Route = createFileRoute(
  '/_aplicacion/proyectos/$id/$folder/formulario/$formId'
)({
  component: Formulario,
});

function Formulario() {
  const { formId } = useParams({ from: Route.id });
  return <FormularioView formularioId={formId} />;
}
