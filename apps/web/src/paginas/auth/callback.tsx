import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { BrandWordmark } from '@/components/layout/brand';
import { resolverCallbackOAuth } from '@/lib/auth/callback';

export default function CallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const ejecutado = useRef(false);

  useEffect(() => {
    if (ejecutado.current) return;
    ejecutado.current = true;

    const params = new URLSearchParams(window.location.search);
    void resolverCallbackOAuth({
      next: params.get('next'),
      error: params.get('error') ?? params.get('error_description'),
    })
      .then(({ redirect }) => window.location.replace(redirect))
      .catch(() =>
        setError('No se pudo completar el inicio de sesión. Intenta de nuevo.')
      );
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <BrandWordmark />
        {error ? (
          <>
            <p role="alert" className="text-destructive text-sm rounded-md bg-destructive/10 p-3">
              {error}
            </p>
            <a href="/login" className="text-primary text-sm hover:underline">
              Volver al inicio de sesión
            </a>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin size-6 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              Completando inicio de sesión...
            </p>
          </>
        )}
      </div>
    </div>
  );
}
