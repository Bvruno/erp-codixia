import { Button } from '@/components/ui/button';

export function Paginacion({
  page,
  pageSize,
  total,
  onCambiar,
}: {
  page: number;
  pageSize: number;
  total: number;
  onCambiar: (page: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  if (paginas <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <span className="text-muted-foreground text-sm">
        Página {page} de {paginas} · {total} registros
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onCambiar(page - 1)}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= paginas}
          onClick={() => onCambiar(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
