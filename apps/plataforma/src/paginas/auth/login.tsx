import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alerta } from '@/components/ui/alerta';
import { login, sendPasswordResetEmail } from '@/lib/auth/actions';

export function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [modoReset, setModoReset] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setInfo(null);

    const formData = new FormData(e.currentTarget);
    const resultado = modoReset ? await sendPasswordResetEmail(formData) : await login(formData);
    setCargando(false);

    if ('error' in resultado && resultado.error) {
      setError(resultado.error);
      return;
    }
    if ('info' in resultado && resultado.info) {
      setInfo(resultado.info);
      return;
    }
    if ('redirect' in resultado && resultado.redirect) {
      await router.navigate({ to: resultado.redirect });
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-lg text-sm font-bold">
              ERP
            </span>
          </div>
          <h1 className="text-xl font-bold">Plataforma de owners</h1>
          <p className="text-muted-foreground text-sm">
            Acceso reservado al equipo de administración.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {modoReset ? 'Restablecer contraseña' : 'Iniciar sesión'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={enviar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={cargando}
                />
              </div>
              {!modoReset && (
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={cargando}
                  />
                </div>
              )}
              {error && <Alerta>{error}</Alerta>}
              {info && <Alerta tipo="info">{info}</Alerta>}
              <Button type="submit" className="w-full" disabled={cargando}>
                {cargando ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Procesando...
                  </>
                ) : modoReset ? (
                  'Enviar enlace'
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
            <button
              type="button"
              className="text-muted-foreground mt-4 text-xs underline-offset-4 hover:underline"
              onClick={() => {
                setModoReset((v) => !v);
                setError(null);
                setInfo(null);
              }}
            >
              {modoReset ? 'Volver al inicio de sesión' : '¿Olvidaste tu contraseña?'}
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
