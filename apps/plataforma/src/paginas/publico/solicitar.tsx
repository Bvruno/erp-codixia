import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { TAMANOS_EQUIPO, zSolicitudOwner } from '@erp/shared/plataforma';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alerta } from '@/components/ui/alerta';
import { api } from '@/lib/api/cliente';

export function SolicitarPage() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const crudo = {
      nombre_contacto: String(formData.get('nombre_contacto') ?? ''),
      email: String(formData.get('email') ?? ''),
      telefono: String(formData.get('telefono') ?? ''),
      empresa: String(formData.get('empresa') ?? ''),
      sitio_web: String(formData.get('sitio_web') ?? ''),
      pais: String(formData.get('pais') ?? ''),
      sector: String(formData.get('sector') ?? ''),
      tamano_equipo: String(formData.get('tamano_equipo') ?? '') || null,
      motivacion: String(formData.get('motivacion') ?? ''),
      referido_por: String(formData.get('referido_por') ?? ''),
      consentimiento: formData.get('consentimiento') === 'on',
      website: String(formData.get('website') ?? ''),
    };

    const validacion = zSolicitudOwner.safeParse(crudo);
    if (!validacion.success) {
      setError('Revisa los campos: nombre, correo, empresa y aceptación del aviso.');
      return;
    }

    setCargando(true);
    try {
      await api.post('/plataforma/solicitudes', validacion.data);
      setEnviado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 py-10">
      <div className="mb-6 space-y-2 text-center">
        <span className="bg-primary text-primary-foreground mx-auto flex size-10 items-center justify-center rounded-lg text-sm font-bold">
          ERP
        </span>
        <h1 className="text-2xl font-bold">Solicita tu acceso</h1>
        <p className="text-muted-foreground text-sm">
          Este ERP es privado: revisamos cada solicitud antes de habilitar una cuenta de
          empresa. Cuéntanos sobre tu negocio y te contactaremos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Datos de contacto y empresa</CardTitle>
        </CardHeader>
        <CardContent>
          {enviado ? (
            <div className="space-y-4 text-center">
              <Alerta tipo="exito">
                Recibimos tu solicitud. Revisaremos tu perfil y te contactaremos por correo.
              </Alerta>
              <p className="text-muted-foreground text-sm">
                Si tu solicitud es aprobada, recibirás un link de invitación para crear tu
                empresa.
              </p>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nombre_contacto">Tu nombre</Label>
                  <Input id="nombre_contacto" name="nombre_contacto" required maxLength={120} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Correo de trabajo</Label>
                  <Input id="email" name="email" type="email" required maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empresa">Empresa</Label>
                  <Input id="empresa" name="empresa" required maxLength={160} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono (opcional)</Label>
                  <Input id="telefono" name="telefono" maxLength={40} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sitio_web">Sitio web (opcional)</Label>
                  <Input id="sitio_web" name="sitio_web" maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pais">País (opcional)</Label>
                  <Input id="pais" name="pais" maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sector">Sector (opcional)</Label>
                  <Input id="sector" name="sector" maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tamano_equipo">Tamaño del equipo</Label>
                  <select
                    id="tamano_equipo"
                    name="tamano_equipo"
                    defaultValue=""
                    className="border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  >
                    <option value="">Selecciona…</option>
                    {TAMANOS_EQUIPO.map((tamano) => (
                      <option key={tamano} value={tamano}>
                        {tamano} personas
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="motivacion">¿Para qué usarás el ERP?</Label>
                <Textarea id="motivacion" name="motivacion" maxLength={2000} rows={4} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referido_por">¿Quién te recomienda? (opcional)</Label>
                <Input id="referido_por" name="referido_por" maxLength={160} />
              </div>

              {/* Honeypot: invisible para personas, tentador para bots. */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="website">No llenar</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" />
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="consentimiento"
                  required
                  className="mt-1 size-4 rounded border"
                />
                <span className="text-muted-foreground">
                  Acepto el aviso de privacidad y el tratamiento de mis datos para evaluar
                  esta solicitud.
                </span>
              </label>

              {error && <Alerta>{error}</Alerta>}

              <Button type="submit" className="w-full" disabled={cargando}>
                {cargando ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar solicitud'
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
