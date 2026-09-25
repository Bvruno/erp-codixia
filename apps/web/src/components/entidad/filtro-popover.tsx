'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OpcionFiltro = {
  key: string;
  label: string;
  color?: string;
  avatar?: { initials: string; bg: string; text: string };
};

// Contenedor estándar de filtros de entidad (búsqueda + popovers).
export function BarraFiltrosEntidad({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex flex-wrap gap-3', className)}>{children}</div>;
}

export function BuscadorEntidad({
  valor,
  onCambio,
  placeholder = 'Buscar…',
  className,
}: {
  valor: string;
  onCambio: (valor: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative max-w-xs flex-1', className)}>
      <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
      <Input
        placeholder={placeholder}
        className="pl-8"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
      />
    </div>
  );
}

export function FiltroPopover({
  label,
  options,
  value,
  onSelect,
  allLabel,
  className,
}: {
  label: string;
  options: OpcionFiltro[];
  value: string;
  onSelect: (key: string) => void;
  allLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value) || null;

  const pick = (key: string) => {
    onSelect(key);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', selected && 'border-primary/40 bg-primary/5', className)}
          title={selected ? `Filtrar por ${selected.label}` : `Filtrar por ${label.toLowerCase()}`}
        >
          {selected ? (
            <>
              {selected.color && (
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
              )}
              {selected.avatar && (
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: selected.avatar.bg, color: selected.avatar.text }}
                >
                  {selected.avatar.initials}
                </span>
              )}
              <span className="text-xs">
                {label}: <span className="font-medium">{selected.label}</span>
              </span>
            </>
          ) : (
            <span className="text-xs">{label}</span>
          )}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <p className="px-2 pt-1.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <button
          type="button"
          onClick={() => pick('all')}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
            value === 'all' && 'bg-accent'
          )}
        >
          <span className="flex-1 truncate text-left">{allLabel}</span>
          {value === 'all' && <Check className="size-4" />}
        </button>
        {options.map((o) => {
          const isSelected = o.key === value;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => pick(o.key)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                isSelected && 'bg-accent'
              )}
            >
              {o.color && (
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
              )}
              {o.avatar && (
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: o.avatar.bg, color: o.avatar.text }}
                >
                  {o.avatar.initials}
                </span>
              )}
              <span className="flex-1 truncate text-left">{o.label}</span>
              {isSelected && <Check className="size-4" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
