'use client';

import { useState } from 'react';
import { Check, Copy, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { valorColumna, type ColumnaRespuestas, type FilaTablaRespuestas } from '@erp/shared';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Vista previa del resultado: tabla real renderizada (cap de filas) o el
// markdown exacto que se guardará en el documento, con copia al portapapeles.

const MAX_FILAS_PREVIA = 5;

export function VistaPreviaTabla({
  columnas,
  filas,
  markdown,
}: {
  columnas: ColumnaRespuestas[];
  filas: FilaTablaRespuestas[];
  markdown: string;
}) {
  const [tab, setTab] = useState('tabla');
  const [copiado, setCopiado] = useState(false);

  const visibles = filas.slice(0, MAX_FILAS_PREVIA);
  const restantes = filas.length - visibles.length;
  const vacia = columnas.length === 0 || filas.length === 0;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopiado(true);
      toast.success('Markdown copiado');
      window.setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error('No se pudo copiar el markdown');
    }
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-2">
      <div className="flex items-center justify-between gap-2">
        <TabsList className="h-8">
          <TabsTrigger value="tabla" className="text-xs">
            Tabla
          </TabsTrigger>
          <TabsTrigger value="markdown" className="text-xs">
            Markdown
          </TabsTrigger>
        </TabsList>
        {tab === 'markdown' && markdown && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void copiar()}
          >
            {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copiar
          </Button>
        )}
      </div>

      <TabsContent value="tabla">
        {vacia ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
            <Table2 className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Seleccioná al menos una columna y una fila.
            </p>
          </div>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <Table aria-label="Vista previa de la tabla">
                <TableHeader>
                  <TableRow>
                    {columnas.map((c) => (
                      <TableHead key={c.id} className="text-xs whitespace-nowrap">
                        {c.titulo}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((f) => (
                    <TableRow key={f.id}>
                      {columnas.map((c) => (
                        <TableCell key={c.id} className="max-w-40 truncate text-xs">
                          {valorColumna(f, c.id)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {restantes > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                y {restantes} fila{restantes === 1 ? '' : 's'} más
              </p>
            )}
          </>
        )}
      </TabsContent>

      <TabsContent value="markdown">
        <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs whitespace-pre">
          {markdown || '—'}
        </pre>
      </TabsContent>
    </Tabs>
  );
}
