import { useState } from 'react';
import { RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaEncabezado,
  TablaFila,
} from '@/components/ui/tabla';
import { Alerta } from '@/components/ui/alerta';
import { Badge } from '@/components/ui/badge';
import { useDatos } from '@/lib/use-datos';
import { agregarAdmin, quitarAdmin } from '@/lib/api/panel';
import { formatearFecha } from '@/lib/formato';
import type { PlatformAdmin } from '@erp/shared/plataforma';

export function AdminsPage() {
  const { datos, cargando, error, recargar } = useDatos<{ data: PlatformAdmin[] }>(
    '/plataforma/admins'
  );
  const [email, setEmail] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  async function agregar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setErrorAccion(null);
    setAviso(null);
    try {
      await agregarAdmin(email.trim());
      setEmail('');
      setAviso('Administrador agregado');
      recargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'No se pudo agregar');
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(admin: PlatformAdmin) {
    setOcupado(true);
    setErrorAccion(null);
    setAviso(null);
    try {
      await quitarAdmin(admin.user_id);
      setAviso('Administrador quitado');
      recargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'No se pudo quitar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Administradores de plataforma</h1>
          <p className="text-muted-foreground text-sm">
            Superadmins con acceso total al panel. No pertenecen a ninguna empresa.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recargar}>
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agregar administrador</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={agregar} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1">
              <Label htmlFor="admin-email">Correo de la cuenta</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="persona@empresa.com"
                required
              />
            </div>
            <Button type="submit" disabled={ocupado}>
              <ShieldCheck />
              Agregar
            </Button>
          </form>
          <p className="text-muted-foreground mt-2 text-xs">
            La persona debe tener una cuenta creada en la plataforma (auth). Si no la tiene,
            usa el script de bootstrap o invítala primero.
          </p>
          {errorAccion && (
            <div className="mt-3">
              <Alerta>{errorAccion}</Alerta>
            </div>
          )}
          {aviso && (
            <div className="mt-3">
              <Alerta tipo="info">{aviso}</Alerta>
            </div>
          )}
        </CardContent>
      </Card>

      {error && <Alerta>{error}</Alerta>}

      <Card>
        <CardContent>
          {cargando ? (
            <p className="text-muted-foreground py-6 text-sm">Cargando administradores…</p>
          ) : (
            <Tabla>
              <TablaEncabezado>
                <TablaFila>
                  <TablaCabecera>Correo</TablaCabecera>
                  <TablaCabecera>Nombre</TablaCabecera>
                  <TablaCabecera>Desde</TablaCabecera>
                  <TablaCabecera />
                </TablaFila>
              </TablaEncabezado>
              <TablaCuerpo>
                {(datos?.data ?? []).map((admin) => (
                  <TablaFila key={admin.user_id}>
                    <TablaCelda>
                      <span className="font-medium">{admin.email ?? admin.user_id}</span>
                      {admin.es_yo && (
                        <Badge variant="secondary" className="ml-2">
                          Tú
                        </Badge>
                      )}
                    </TablaCelda>
                    <TablaCelda>{admin.nombre ?? '—'}</TablaCelda>
                    <TablaCelda className="text-muted-foreground text-xs">
                      {formatearFecha(admin.created_at)}
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      {!admin.es_yo && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={ocupado}
                          onClick={() => quitar(admin)}
                        >
                          <Trash2 />
                          Quitar
                        </Button>
                      )}
                    </TablaCelda>
                  </TablaFila>
                ))}
              </TablaCuerpo>
            </Tabla>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
