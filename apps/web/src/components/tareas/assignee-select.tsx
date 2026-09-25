'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/cliente';
import { TTL_CACHE } from '@/lib/cache-claves';
import { createInvitation } from '@/lib/auth/actions';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, MailPlus, Search, User, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types';

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function avatarColor(id: string) {
  const hue = hashHue(id);
  return {
    bg: `hsl(${hue} 60% 45% / 0.18)`,
    text: `hsl(${hue} 70% 35%)`,
    border: `hsl(${hue} 60% 45% / 0.25)`,
  };
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AssigneeSelect({
  value,
  onSelect,
  collaborators,
  isAdmin,
  organizationId,
  listId,
  align = 'start',
  readOnly = false,
}: {
  value: string;
  onSelect: (id: string) => void;
  collaborators: Profile[];
  isAdmin: boolean;
  organizationId: string | null;
  listId?: string | null;
  align?: 'start' | 'center' | 'end';
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  // Catálogo cacheado: no se repite la petición cada vez que el popover se
  // abre (antes dependía de la identidad de `collaborators`).
  const asignablesQuery = useQuery({
    queryKey: ['horarios', 'asignables', organizationId],
    queryFn: async () => {
      const res = await apiFetch<{ schedules: { user_id: string }[]; owner_id: string | null }>(
        `/horarios/asignables?organization_id=${encodeURIComponent(organizationId!)}`
      );
      return res;
    },
    enabled: open && !!organizationId && isAdmin,
    staleTime: TTL_CACHE.catalogo,
    refetchOnWindowFocus: false,
  });

  const blockedUsers = useMemo(() => {
    const res = asignablesQuery.data;
    const blocked = new Set<string>();
    if (!res) return blocked;
    const owner = res.owner_id ?? null;
    const withSchedule = new Set((res.schedules || []).map((s) => s.user_id));
    collaborators.forEach((c) => {
      if (c.id !== owner && !withSchedule.has(c.id)) blocked.add(c.id);
    });
    return blocked;
  }, [asignablesQuery.data, collaborators]);

  const setOpenInternal = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch('');
  };

  const selected = value ? collaborators.find((c) => c.id === value) ?? null : null;
  const selectedAvatar = selected ? avatarColor(selected.id) : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return collaborators;
    return collaborators.filter((c) =>
      c.full_name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
    );
  }, [collaborators, search]);

  const noMatches = search.trim() && filtered.length === 0;

  const invite = async (label?: string) => {
    if (!listId) return;
    setBusy(true);
    try {
      const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const res = await createInvitation({
        role: 'collaborator',
        expiresAt,
        entityType: 'list',
        entityId: listId,
        permission: 'write',
        inherit: false,
      });
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      const link = res.link || `${window.location.origin}/invite/${res.token}`;
      await navigator.clipboard.writeText(link);
      toast.success(
        label
          ? `Invitación enviada a ${label} — acceso aislado a la lista`
          : 'Link copiado — acceso aislado a la lista'
      );
      setOpenInternal(false);
    } catch {
      toast.error('No se pudo generar la invitación');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={readOnly ? false : open} onOpenChange={setOpenInternal}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md transition-colors hover:bg-muted/60"
          title={readOnly ? 'Asignación fija (solo lectura)' : 'Asignar persona'}
          onClick={(e) => {
            if (readOnly) e.preventDefault();
          }}
        >
          {selected ? (
            <Avatar
              className="size-7 border"
              style={{ backgroundColor: selectedAvatar?.bg, borderColor: selectedAvatar?.border }}
            >
              <AvatarFallback
                className="text-xs font-semibold"
                style={{ color: selectedAvatar?.text, backgroundColor: 'transparent' }}
              >
                {getInitials(selected.full_name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <span className="inline-flex size-7 items-center justify-center rounded-full border border-dashed border-muted-foreground/30">
              <User className="size-3.5 text-muted-foreground/60" />
            </span>
          )}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {selected?.full_name}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] max-w-[calc(100vw-1rem)] p-0" align={align}>
        <div className="border-b p-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Busca o ingresa un correo electrónico"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5">
          <button
            type="button"
            onClick={() => { onSelect(''); setOpenInternal(false); }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
              value === '' && 'bg-accent'
            )}
          >
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/30">
              <User className="size-3 text-muted-foreground/70" />
            </span>
            <span className="flex-1 truncate text-left">Sin asignar</span>
            {value === '' && <Check className="size-4" />}
          </button>

          <p className="px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Personas
          </p>

          {filtered.length === 0 && !noMatches && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No hay colaboradores aún
            </p>
          )}

          {filtered.map((c) => {
            const av = avatarColor(c.id);
            const isSelected = c.id === value;
            const blocked = blockedUsers.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  if (blocked) {
                    toast.error(
                      `${c.full_name} no tiene horario: asígnalo primero desde Colaboradores`,
                    );
                    return;
                  }
                  onSelect(c.id);
                  setOpenInternal(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                  isSelected && 'bg-accent',
                  blocked && 'opacity-60',
                )}
                aria-disabled={blocked}
              >
                <Avatar
                  className="size-6 shrink-0 border"
                  style={{ backgroundColor: av.bg, borderColor: av.border }}
                >
                  <AvatarFallback
                    className="text-xs font-semibold"
                    style={{ color: av.text, backgroundColor: 'transparent' }}
                  >
                    {getInitials(c.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-left">{c.full_name}</span>
                {blocked ? (
                  <span className="text-red-400 text-xs">Sin horario</span>
                ) : (
                  isSelected && <Check className="size-4" />
                )}
              </button>
            );
          })}

          {noMatches && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No se encontró a «{search.trim()}»
            </div>
          )}
        </div>

        <div className="border-t p-1.5">
          {isAdmin && listId && noMatches && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              disabled={busy}
              onClick={() => invite(search.trim())}
            >
              <MailPlus className="size-3.5" />
              Invitar a {search.trim().includes('@') ? search.trim() : `«${search.trim()}»`} por correo
            </Button>
          )}
          {isAdmin && listId && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              disabled={busy}
              onClick={() => invite()}
            >
              <UserPlus className="size-3.5" />
              Invitar a nuevo colaborador
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

