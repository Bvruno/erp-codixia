'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'destructive' | 'default';
  onConfirm: () => void;
  loading?: boolean;
  /** Si se pasa, exige escribir exactamente este texto para habilitar la confirmación. */
  requireText?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  variant = 'destructive',
  onConfirm,
  loading = false,
  requireText,
}: ConfirmDialogProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setConfirmInput('');
  }

  const matched = requireText === undefined || confirmInput.trim() === requireText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${variant === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10'}`}>
              <AlertTriangle className={`size-5 ${variant === 'destructive' ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requireText !== undefined && (
          <div className="space-y-2">
            <Label htmlFor="confirm-dialog-input">
              Escribe <span className="font-medium text-foreground">{requireText}</span> para confirmar
            </Label>
            <Input
              id="confirm-dialog-input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={requireText}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matched && !loading) onConfirm();
              }}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={loading || !matched}
          >
            {loading ? 'Procesando...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
