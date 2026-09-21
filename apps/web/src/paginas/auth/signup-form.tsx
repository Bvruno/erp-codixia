'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signup } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { GoogleButton } from '@/components/auth/google-button';
import { Separator } from '@/components/ui/separator';
import { translateAuthError } from '@/lib/auth/errors';
import { BrandWordmark } from '@/components/layout/brand';

export function SignupForm({
  inviteToken = null,
  inviteValid = false,
}: {
  inviteToken?: string | null;
  inviteValid?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const formData = new FormData(e.currentTarget);
    const result = await signup(formData);

    if (result?.error) {
      setError(translateAuthError(result.error));
      setLoading(false);
      return;
    }

    if (result?.info) {
      setInfo(result.info);
      setLoading(false);
      return;
    }

    if (result?.redirect) {
      router.push(result.redirect);
      return;
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandWordmark />
          <h1 className="mt-2 text-2xl font-bold">Crear Cuenta</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Completa tus datos para unirte a la organización
          </p>
        </div>
        {inviteValid && (
          <p
            role="status"
            className="text-primary text-sm rounded-md bg-primary/10 p-2 text-center"
          >
            Has sido invitado. Crea tu cuenta para aceptar la invitación.
          </p>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Registrarse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <GoogleButton label="Registrarse con Google" invite={inviteToken} />
              <div className="relative">
                <Separator />
                <span className="text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs uppercase">
                  o
                </span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input type="hidden" name="invite" value={inviteToken ?? ''} />
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nombre completo</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    type="text"
                    placeholder="Tu nombre"
                    required
                    autoComplete="name"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="tu@email.com"
                    required
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="pr-10"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirmar contraseña</Label>
                  <Input
                    id="confirm_password"
                    name="confirm_password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Repite tu contraseña"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="consent"
                    checked={consent}
                    onCheckedChange={(checked) => setConsent(checked === true)}
                    disabled={loading}
                    aria-required="true"
                  />
                  <input
                    type="hidden"
                    name="consent"
                    value="on"
                    disabled={!consent}
                    aria-hidden="true"
                  />
                  <Label
                    htmlFor="consent"
                    className="text-muted-foreground text-xs leading-relaxed font-normal cursor-pointer"
                  >
                    He leído y acepto los{' '}
                    <span className="text-primary">términos de uso</span> y la{' '}
                    <span className="text-primary">política de privacidad</span>
                  </Label>
                </div>
                {error && (
                  <p
                    role="alert"
                    className="text-destructive text-sm rounded-md bg-destructive/10 p-2"
                  >
                    {error}
                  </p>
                )}
                {info && (
                  <p
                    role="status"
                    className="text-emerald-400 text-sm rounded-md bg-emerald-400/10 p-2"
                  >
                    {info}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !consent}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Creando cuenta...
                    </>
                  ) : (
                    'Crear cuenta'
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-center text-sm">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
