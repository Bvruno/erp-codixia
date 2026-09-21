'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFormatoHora } from '@/lib/use-formato-hora';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function to12(hour24: number) {
  const h = hour24 % 12;
  return h === 0 ? 12 : h;
}

function isPM(hour24: number) {
  return hour24 >= 12;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const { timeFormat, formatHora } = useFormatoHora();
  const [open, setOpen] = useState(false);
  const [hour24, minute] = (value || '09:00').split(':').map(Number);
  const hour12 = to12(hour24);
  const pm = isPM(hour24);
  const es24h = timeFormat === '24h';

  const build = (h: number, m: number) => `${pad(h)}:${pad(m)}`;

  const pickHour = (h: number) => {
    const hour = es24h ? h : (h % 12) + (pm ? 12 : 0);
    onChange(build(hour, minute));
  };

  const pickMinute = (m: number) => {
    onChange(build(hour24, m));
  };

  const pickPeriod = (period: 'am' | 'pm') => {
    const isPm = period === 'pm';
    const hour = hour24 % 12 + (isPm ? 12 : 0);
    onChange(build(hour, minute));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-mono"
          type="button"
        >
          {formatHora(value || '09:00')}
          <Clock className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-2">
          <div className="h-48 overflow-y-auto pr-1">
            <div className="text-muted-foreground text-[11px] font-medium uppercase mb-1 px-2">
              Hora
            </div>
            <div className="flex flex-col gap-0.5">
              {(es24h ? HOURS_24 : HOURS_12).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => pickHour(h)}
                  className={cn(
                    'hover:bg-accent rounded px-3 py-2 font-mono text-sm transition-colors',
                    (es24h ? h === hour24 : h === hour12) &&
                      'bg-primary text-primary-foreground hover:bg-primary'
                  )}
                >
                  {es24h ? pad(h) : h}
                </button>
              ))}
            </div>
          </div>
          <div className="h-48 overflow-y-auto pr-1">
            <div className="text-muted-foreground text-[11px] font-medium uppercase mb-1 px-2">
              Min
            </div>
            <div className="flex flex-col gap-0.5">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMinute(m)}
                  className={cn(
                    'hover:bg-accent rounded px-3 py-2 font-mono text-sm transition-colors',
                    m === minute && 'bg-primary text-primary-foreground hover:bg-primary'
                  )}
                >
                  {pad(m)}
                </button>
              ))}
            </div>
          </div>
          {!es24h && (
            <div className="flex flex-col gap-0.5">
              <div className="text-muted-foreground text-[11px] font-medium uppercase mb-1 px-2">
                Período
              </div>
              {(['AM', 'PM'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => pickPeriod(period.toLowerCase() as 'am' | 'pm')}
                  className={cn(
                    'hover:bg-accent rounded px-3 py-2 text-sm font-medium transition-colors',
                    (period === 'PM') === pm && 'bg-primary text-primary-foreground hover:bg-primary'
                  )}
                >
                  {period}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
