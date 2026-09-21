"use client";

import { useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const FALLBACK_ZONES = [
  "America/Mexico_City",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Caracas",
  "America/Guatemala",
  "America/Havana",
  "Europe/Madrid",
  "UTC",
];

function availableZones(): string[] {
  if (typeof window === "undefined") return FALLBACK_ZONES;
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_ZONES;
  }
}

function zoneLabel(zone: string) {
  return zone.replace(/_/g, " ").replace("America/", "");
}

interface TimezonePickerProps {
  value: string;
  onChange: (timezone: string) => void;
}

export function TimezonePicker({ value, onChange }: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const zones = useMemo(() => {
    const all = availableZones();
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((z) => z.toLowerCase().includes(q));
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          type="button"
        >
          <span className="flex items-center gap-2 truncate">
            <Globe className="size-4 text-muted-foreground shrink-0" />
            <span className="truncate font-mono text-xs">{value}</span>
          </span>
          <span className="text-muted-foreground text-xs shrink-0">
            {zoneLabel(value)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[calc(100vw-1rem)] p-2" align="start">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar zona horaria..."
          className="mb-2"
        />
        <div className="h-56 overflow-y-auto pr-1">
          {zones.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-center text-sm">
              Sin resultados
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {zones.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  onClick={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                  className={cn(
                    "hover:bg-accent flex items-center justify-between rounded px-2 py-2 text-sm transition-colors",
                    zone === value && "bg-accent",
                  )}
                >
                  <span className="truncate font-mono text-xs">{zone}</span>
                  {zone === value && (
                    <Check className="text-primary size-4 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
