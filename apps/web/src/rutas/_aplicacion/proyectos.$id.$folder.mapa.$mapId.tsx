import { createFileRoute, useParams } from '@tanstack/react-router';
import { MindMapEditor } from '@/components/mapas/mind-map';

export const Route = createFileRoute(
  '/_aplicacion/proyectos/$id/$folder/mapa/$mapId'
)({
  component: Mapa,
});

function Mapa() {
  const { mapId } = useParams({ from: Route.id });
  return <MindMapEditor mapId={mapId} />;
}