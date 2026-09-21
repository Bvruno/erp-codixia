'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { translateAuthError } from '@/lib/auth/errors';
import { BrandWordmark } from '@/components/layout/brand';

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await sendPasswordResetEmail(formData);

    if (result?.error) {
      setError(translateAuthError(result.error));
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <BrandWordmark />
          <h1 className="mt-2 text-2xl font-bold">Recuperar Contraseña</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Te enviaremos un enlace para restablecerla
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Restablecer</CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-center">
                <MailCheck className="text-primary mx-auto size-10" />
                <p className="text-muted-foreground text-sm">
                  Si el email existe, recibirás un enlace para restablecer tu
                  contraseña. Revisa también tu carpeta de spam.
                </p>
                <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                  Reenviar email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
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
                      Enviando...
                    </>
                  ) : (
                    'Enviar enlace'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-center text-sm">
          ¿Recordaste tu contraseña?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
