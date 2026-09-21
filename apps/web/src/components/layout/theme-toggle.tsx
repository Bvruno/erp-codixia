'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, apiFetch } from '@/lib/api/cliente';
import { cn } from '@/lib/utils';
import { aplicarTema, resolverTema, type TemaResuelto } from '@/lib/tema';
import { usePerfil, type PerfilPayload } from '@/lib/use-perfil';
import {
  DEFAULT_PREFERENCES,
  type ProfilePreferences,
  type ThemePreference,
} from '@/types';
import { toast } from 'sonner';

// El tema vive en las preferencias del perfil; este toggle solo alterna
// entre claro y oscuro (y `system` se resuelve contra el SO).
export function ThemeToggle({
  className,
  tema,
}: {
  className?: string;
  tema: ThemePreference;
}) {
  const [modo, setModo] = useState<TemaResuelto>('dark');
  const queryClient = useQueryClient();
  const perfilQuery = usePerfil({ enabled: false });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync de prop a estado local (tema resuelto)
    setModo(resolverTema(tema));
  }, [tema]);

  const toggle = async () => {
    const siguiente: ThemePreference = modo === 'dark' ? 'light' : 'dark';
    setModo(siguiente);
    aplicarTema(siguiente);

    try {
      let prefsActuales: Partial<ProfilePreferences> | null =
        perfilQuery.data?.profile?.preferences ?? null;
      if (!prefsActuales) {
        const res = await apiFetch<{
          preferences: Partial<ProfilePreferences> | null;
        }>('/perfil/preferencias').catch(() => null);
        prefsActuales = res?.preferences ?? null;
      }
      const prefs: ProfilePreferences = {
        ...DEFAULT_PREFERENCES,
        ...prefsActuales,
        notif: {
          ...DEFAULT_PREFERENCES.notif,
          ...(prefsActuales?.notif || {}),
        },
        theme: siguiente,
      };
      await api.put('/perfil/preferencias', { preferences: prefs });
      queryClient.setQueryData<PerfilPayload>(['perfil', 'datos'], (old) =>
        old?.profile
          ? { ...old, profile: { ...old.profile, preferences: prefs } }
          : old,
      );
    } catch {
      // Revierte el cambio local si no se pudo persistir.
      setModo(resolverTema(tema));
      aplicarTema(tema);
      toast.error('No se pudo guardar el tema');
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn('size-8', className)}
      title={modo === 'dark' ? 'Modo claro' : 'Modo oscuro'}
    >
      {modo === 'dark' ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}
