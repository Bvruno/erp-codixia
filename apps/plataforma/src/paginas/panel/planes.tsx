import { useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import type { Plan } from '@erp/shared/plataforma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alerta } from '@/components/ui/alerta';
import { useDatos } from '@/lib/use-datos';
import { guardarPlan } from '@/lib/api/panel';

export function PlanesPage() {
  const { datos, cargando, error, recargar } = useDatos<{ data: Plan[] }>('/plataforma/planes');
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Planes</h1>
          <p className="text-muted-foreground text-sm">
            Catálogo de precios. Se asigna a cada empresa desde su ficha.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recargar}>
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      {error && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="info">{aviso}</Alerta>}
      {cargando && <p className="text-muted-foreground text-sm">Cargando planes…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(datos?.data ?? []).map((plan) => (
          <EditorPlan
            key={plan.id}
            plan={plan}
            onGuardado={(mensaje) => {
              setAviso(mensaje);
              if (!mensaje.startsWith('No')) recargar();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function EditorPlan({
  plan,
  onGuardado,
}: {
  plan: Plan;
  onGuardado: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState(plan.nombre);
  const [precio, setPrecio] = useState(String(plan.precio_mensual));
  const [moneda, setMoneda] = useState(plan.moneda);
  const [limites, setLimites] = useState(JSON.stringify(plan.limites ?? {}, null, 2));
  const [ocupado, setOcupado] = useState(false);

  async function guardar() {
    setOcupado(true);
    try {
      let limitesJson: Record<string, unknown> = {};
      try {
        limitesJson = JSON.parse(limites || '{}') as Record<string, unknown>;
      } catch {
        onGuardado('Los límites deben ser JSON válido');
        return;
      }
      await guardarPlan({
        id: plan.id,
        nombre,
        precio_mensual: Number(precio),
        moneda,
        limites: limitesJson,
        orden: plan.orden,
      });
      onGuardado(`Plan ${nombre} actualizado`);
    } catch (e) {
      onGuardado(e instanceof Error ? e.message : 'No se pudo guardar el plan');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Plan {plan.id}</CardTitle>
        <span className="text-muted-foreground text-xs">orden {plan.orden}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={`nombre-${plan.id}`}>Nombre</Label>
            <Input id={`nombre-${plan.id}`} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`precio-${plan.id}`}>Precio mensual</Label>
            <Input
              id={`precio-${plan.id}`}
              type="number"
              min={0}
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`moneda-${plan.id}`}>Moneda</Label>
            <Input
              id={`moneda-${plan.id}`}
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`limites-${plan.id}`}>Límites (JSON)</Label>
          <textarea
            id={`limites-${plan.id}`}
            value={limites}
            onChange={(e) => setLimites(e.target.value)}
            rows={3}
            className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px]"
          />
        </div>
        <Button disabled={ocupado} onClick={guardar}>
          <Save />
          Guardar plan
        </Button>
      </CardContent>
    </Card>
  );
}
