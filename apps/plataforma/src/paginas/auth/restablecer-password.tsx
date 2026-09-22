import { useEffect, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alerta } from '@/components/ui/alerta';
import { sesionActual } from '@/lib/auth/sesion';
import { updatePassword } from '@/lib/auth/actions';

export function RestablecerPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    void sesionActual().then((sesion) => {
      if (!sesion) setError('El enlace no es válido o expiró. Solicita uno nuevo.');
      else setListo(true);
    });
  }, []);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const resultado = await updatePassword(new FormData(e.currentTarget));
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    await router.navigate({ to: '/login' });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Nueva contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          {listo ? (
            <form onSubmit={enviar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              {error && <Alerta>{error}</Alerta>}
              <Button type="submit" className="w-full">
                Guardar contraseña
              </Button>
            </form>
          ) : (
            error && <Alerta>{error}</Alerta>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
