'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterOption = {
  key: string;
  label: string;
  color?: string;
  avatar?: { initials: string; bg: string; text: string };
};

export function FilterPopover({
  label,
  options,
  value,
  onSelect,
  allLabel,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onSelect: (key: string) => void;
  allLabel: string;
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
          className={cn('gap-1.5', selected && 'border-primary/40 bg-primary/5')}
          title={selected ? `Filtrar por ${selected.label}` : `Filtrar por ${label.toLowerCase()}`}
        >
          {selected ? (
            <>
              {selected.color && (
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
              )}
              {selected.avatar && (
                <span
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold"
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
        <p className="px-2 pt-1.5 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
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
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
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
