'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { GoogleButton } from '@/components/auth/google-button';
import { Separator } from '@/components/ui/separator';
import { translateAuthError } from '@/lib/auth/errors';
import { BrandWordmark } from '@/components/layout/brand';

export function LoginForm({
  initialError,
  resetOk,
  loggedNoOrg,
  invite,
}: {
  initialError?: string;
  resetOk?: boolean;
  loggedNoOrg?: boolean;
  invite?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    initialError === 'no-access'
      ? 'Tu cuenta no tiene acceso a la plataforma. Si tienes una invitación pendiente, ábrela con el link que recibiste.'
      : initialError === 'auth'
        ? 'No se pudo completar el inicio de sesión. Intenta de nuevo.'
        : initialError === 'google-no-account'
          ? 'No existe una cuenta para este Google. Si fuiste invitado, crea tu cuenta desde el link de invitación.'
          : initialError === 'invite-invalid'
            ? 'El link de invitación no es válido o expiró. Solicita uno nuevo.'
            : initialError === 'blocked'
              ? 'Tu cuenta está bloqueada. Contacta al administrador.'
              : null
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await login(formData);

if (result?.error) {
        setError(
          result.error === 'no-access'
            ? 'Tu cuenta no tiene acceso a la plataforma. Si tienes una invitación pendiente, ábrela con el link que recibiste.'
            : translateAuthError(result.error)
        );
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
          <h1 className="mt-2 text-2xl font-bold">Iniciar sesión</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ingresa a tu cuenta para continuar
          </p>
        </div>
        {resetOk && (
          <p
            role="status"
            className="text-success text-sm rounded-md bg-success/10 p-2 text-center"
          >
            Contraseña actualizada correctamente. Inicia sesión.
          </p>
        )}
        {loggedNoOrg && (
          <div
            role="alert"
            className="text-destructive text-sm rounded-md bg-destructive/10 p-3 space-y-2"
          >
            <p>
              La sesión actual no tiene acceso a ninguna organización. Usa una
              cuenta invitada o cierra sesión.
            </p>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Acceder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <GoogleButton invite={invite} />
              <div className="relative">
                <Separator />
                <span className="text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs uppercase">
                  o
                </span>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {invite && <input type="hidden" name="invite" value={invite} />}
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Contraseña</Label>
                    <Link
                      href="/forgot-password"
                      className="text-primary hover:underline text-xs"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="pr-10"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground pointer-coarse:size-11"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                {error && (
                  <p
                    role="alert"
                    className="text-destructive text-sm rounded-md bg-destructive/10 p-2"
                  >
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Ingresando...
                    </>
                  ) : (
                    'Ingresar'
                  )}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-center text-xs">
          ¿No tienes acceso? Solicita un link de invitación al administrador.
        </p>
      </div>
    </div>
  );
}
