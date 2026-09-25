'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api/cliente';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, Pencil, Pen, Highlighter, Undo2, Eraser, Trash2, Loader2 } from 'lucide-react';

export type NotePayload = {
  id?: string;
  note_date: string;
  title: string;
  content: string | null;
  drawing: unknown[] | null;
  image: string | null;
};

export type Note = NotePayload & {
  id: string;
  organization_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Stroke = { color: string; o: number; pts: { x: number; y: number; w: number }[] };

const parseDate = (s: string) => new Date(`${s}T00:00:00`);

const formatoLargo = (fecha: Date) => {
  const [dia, num, mes, anio] = format(fecha, 'EEEE d MMMM yyyy', { locale: es }).split(' ');
  return `${dia} ${num} de ${mes} de ${anio}`;
};

const TOOLS = {
  pencil: { w: 2, o: 0.65 },
  pen: { w: 3.2, o: 1 },
  marker: { w: 15, o: 0.38 },
} as const;

const INK_COLORS = [
  '#1f2430', '#64748b', '#e0526b', '#ef4444', '#f97316', '#f59e0b',
  '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#a16207',
];

export function NoteSheet({
  open,
  note,
  defaultDate,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  note: Note | null;
  defaultDate: Date;
  onClose: () => void;
  onSave: (payload: NotePayload) => void | Promise<void>;
  onDelete?: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [detalleCompleto, setDetalleCompleto] = useState<Note | null>(null);
  const [mode, setMode] = useState<'text' | 'draw'>('text');
  const [noteDate, setNoteDate] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [inkColor, setInkColor] = useState(INK_COLORS[0]);
  const [tool, setTool] = useState<keyof typeof TOOLS>('pen');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);

  // El listado de calendario llega sin drawing/image (payload ligero);
  // al abrir una nota existente se pide el detalle completo.
  const notaEfectiva =
    detalleCompleto && note && detalleCompleto.id === note.id ? detalleCompleto : note;

  const reset = useCallback(() => {
    setMode(notaEfectiva?.image ? 'draw' : 'text');
    setNoteDate(notaEfectiva?.note_date ?? defaultDate.toISOString().slice(0, 10));
    setTitle(notaEfectiva?.title ?? '');
    setContent(notaEfectiva?.content ?? '');
    setStrokes(notaEfectiva?.drawing ? (notaEfectiva.drawing as Stroke[]) : []);
    setInkColor(INK_COLORS[0]);
    setTool('pen');
    currentStrokeRef.current = null;
  }, [notaEfectiva, defaultDate]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!open || !note?.id) return;
    if (note.drawing != null || note.image != null) return;
    let activo = true;
    void apiFetch<{ nota: Note }>(`/calendario/notas/${note.id}`)
      .then((res) => {
        if (activo && res?.nota) setDetalleCompleto(res.nota);
      })
      .catch(() => undefined);
    return () => {
      activo = false;
    };
  }, [open, note]);

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(100, Math.round(r.width * dpr));
    canvas.height = Math.max(100, Math.round(r.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((s) => {
      ctx.globalAlpha = s.o;
      ctx.strokeStyle = s.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      s.pts.forEach((p, i) => {
        ctx.lineWidth = p.w;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
     
  }, [strokes]);

  useEffect(() => {
    if (open && mode === 'draw') {
      // Doble rAF: el ancho del Sheet ya está definido pero la animación de
      // entrada puede no haber pintado el canvas todavía.
      const id = requestAnimationFrame(() => requestAnimationFrame(fitCanvas));
      return () => cancelAnimationFrame(id);
    }
  }, [open, mode, fitCanvas]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => fitCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, fitCanvas]);

  if (!open) return null;

  const ptFor = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0, w: 2 };
    const r = c.getBoundingClientRect();
    const p = e.pressure || 0.5;
    const cfg = TOOLS[tool];
    return {
      x: (e.clientX - r.left) * (c.width / r.width),
      y: (e.clientY - r.top) * (c.height / r.height),
      w: cfg.w * (0.3 + p * 0.9),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    const p = ptFor(e);
    const stroke: Stroke = { color: inkColor, o: TOOLS[tool].o, pts: [p] };
    currentStrokeRef.current = stroke;
    setStrokes((prev) => [...prev, stroke]);
    const g = c.getContext('2d');
    if (!g) return;
    g.globalAlpha = stroke.o;
    g.strokeStyle = inkColor;
    g.lineWidth = p.w;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = currentStrokeRef.current;
    const c = canvasRef.current;
    if (!s || !c) return;
    e.preventDefault();
    const p = ptFor(e);
    const last = s.pts[s.pts.length - 1];
    s.pts.push(p);
    const g = c.getContext('2d');
    if (!g) return;
    g.globalAlpha = s.o;
    g.strokeStyle = s.color;
    g.lineWidth = p.w;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(last.x, last.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    g.globalAlpha = 1;
    setStrokes((prev) => [...prev]);
  };

  const endStroke = () => {
    currentStrokeRef.current = null;
  };

  const currentDate = noteDate || note?.note_date || defaultDate.toISOString().slice(0, 10);

  const doSave = async () => {
    if (guardando) return;
    const c = canvasRef.current;
    const t = title.trim();
    const isDraw = mode === 'draw';
    let drawing: unknown[] | null = null;
    let image: string | null = null;
    if (isDraw) {
      if (strokes.length === 0) return;
      drawing = strokes;
      image = c?.toDataURL() ?? null;
    }
    const finalContent = isDraw ? null : content.trim();
    if (!t && !finalContent && !isDraw) return;
    setGuardando(true);
    try {
      await onSave({
        id: note?.id,
        note_date: currentDate,
        title: t || note?.title || 'Nota',
        content: finalContent || null,
        drawing,
        image,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !guardando) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 flex-row items-center justify-between gap-1.5 border-b px-5 py-4 pr-14">
          <SheetTitle className="font-display text-base font-bold tracking-tight">
            {note ? 'Editar nota' : 'Nueva nota'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Editor de notas del calendario con texto o dibujo a mano alzada.
          </SheetDescription>
          {note && onDelete && (
            <button
              onClick={onDelete}
              className="flex size-8 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
              aria-label="Eliminar nota"
              title="Eliminar nota"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-5 py-4">
          <div className="flex w-full gap-1 rounded-lg bg-muted p-1">
            {(['text', 'draw'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                {m === 'text' ? <Pencil className="size-3.5" /> : <Pen className="size-3.5" />}
                {m === 'text' ? 'Texto' : 'Mano alzada'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note-date" className="text-xs font-semibold text-muted-foreground">Fecha</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  id="note-date"
                  type="button"
                  className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  title="Cambiar fecha"
                >
                  <CalendarDays className="size-4 text-primary" />
                  {formatoLargo(parseDate(currentDate))}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseDate(currentDate)}
                  onSelect={(d) => {
                    if (d) {
                      setNoteDate(format(d, 'yyyy-MM-dd'));
                      setCalendarOpen(false);
                    }
                  }}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note-title" className="text-xs font-semibold text-muted-foreground">Título</Label>
            <Input id="note-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título de la nota" />
          </div>

          {mode === 'text' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="note-content" className="text-xs font-semibold text-muted-foreground">Contenido</Label>
              <Textarea
                id="note-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escribe tu nota aquí…"
                className="min-h-[140px] flex-1 resize-none"
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2.5">
              <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border bg-white">
                <canvas
                  ref={canvasRef}
                  className="h-full w-full touch-none cursor-crosshair"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endStroke}
                  onPointerCancel={endStroke}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
                {(Object.keys(TOOLS) as (keyof typeof TOOLS)[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTool(k)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                      tool === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                    )}
                  >
                    {k === 'pencil' ? <Pencil className="size-3.5" /> : k === 'pen' ? <Pen className="size-3.5" /> : <Highlighter className="size-3.5" />}
                    {k === 'pencil' ? 'Lápiz' : k === 'pen' ? 'Pluma' : 'Plumón'}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {INK_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setInkColor(c)}
                    className={cn('size-6 rounded-full border-2', inkColor === c ? 'border-foreground ring-2 ring-card' : 'border-transparent')}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
                <div className="ml-auto flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                    title="Deshacer"
                  >
                    <Undo2 className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setStrokes([])} title="Limpiar">
                    <Eraser className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3.5">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={doSave} disabled={guardando}>
            {guardando ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
