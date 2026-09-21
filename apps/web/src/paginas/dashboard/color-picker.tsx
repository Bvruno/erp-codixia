"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";

export const SHIFT_COLORS = [
  "#3b82f6",
  "#06b6d4",
  "#0ea5e9",
  "#10b981",
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#f43f5e",
  "#ec4899",
  "#a855f7",
  "#8b5cf6",
  "#64748b",
] as const;

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          type="button"
        >
          <span className="flex items-center gap-2">
            <span
              className="size-4 rounded-full border"
              style={{ backgroundColor: value }}
            />
            <span className="text-muted-foreground text-xs">Color</span>
          </span>
          <Palette className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="start">
        <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
          Color del turno
        </p>
        <div className="grid grid-cols-5 gap-2">
          {SHIFT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              onClick={() => {
                onChange(color);
                setOpen(false);
              }}
              className={cn(
                "size-9 rounded-full border border-black/20 transition-transform hover:scale-110",
                value === color &&
                  "ring-ring ring-2 ring-offset-2 ring-offset-background",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
