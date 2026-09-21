'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeOnboarding } from '@/lib/auth/complete-onboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { TimezonePicker } from '../dashboard/timezone-picker';
import { BrandWordmark } from '@/components/layout/brand';

export function OnboardingForm({
  orgName,
  dailyHours,
  weeklyHours,
  timezone,
}: {
  orgName: string;
  dailyHours: number;
  weeklyHours: number;
  timezone: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tz, setTz] = useState(timezone);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set('timezone', tz);

    let result;
    try {
      result = await completeOnboarding(formData);
    } catch {
      setError('Ocurrió un error al guardar. Intenta de nuevo.');
      setLoading(false);
      return;
    }

    if (result?.error) {
      setError(
        result.error === 'no-access'
          ? 'Tu cuenta no tiene acceso a la plataforma.'
          : result.error
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
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <BrandWordmark />
          </div>
          <h1 className="text-2xl font-bold">Configura tu empresa</h1>
          <p className="text-muted-foreground text-sm">
            Define los datos principales de tu organización. Podrás cambiarlos
            más adelante desde Configuración.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Información de la empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org_name">Nombre de la empresa</Label>
                <Input
                  id="org_name"
                  name="org_name"
                  type="text"
                  placeholder="Nombre de tu empresa"
                  defaultValue={orgName}
                  required
                  autoComplete="organization"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label>Zona horaria</Label>
                <TimezonePicker value={tz} onChange={setTz} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="daily_hours">Horas diarias</Label>
                  <Input
                    id="daily_hours"
                    name="daily_hours"
                    type="number"
                    min={1}
                    max={24}
                    defaultValue={dailyHours}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weekly_hours">Horas semanales</Label>
                  <Input
                    id="weekly_hours"
                    name="weekly_hours"
                    type="number"
                    min={1}
                    max={168}
                    defaultValue={weeklyHours}
                    disabled={loading}
                  />
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
                    Configurando...
                  </>
                ) : (
                  'Crear empresa'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

