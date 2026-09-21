import { createFileRoute, useParams } from '@tanstack/react-router';
import { DocumentView } from '@/components/tareas/document-view';

export const Route = createFileRoute(
  '/_aplicacion/proyectos/$id/$folder/documento/$docId'
)({
  component: Documento,
});

function Documento() {
  const { docId } = useParams({ from: Route.id });
  return <DocumentView docId={docId} />;
}