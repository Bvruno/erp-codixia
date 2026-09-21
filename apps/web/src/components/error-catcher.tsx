'use client';

import { useEffect } from 'react';
import { captureErrorClient } from '@/lib/errors';

// Cazador global de errores no capturados del navegador:
// window.onerror + unhandledrejection → error_logs.
// Debounce: máx 10 envíos por minuto por pestaña (anti-spam).
export function ErrorCatcher() {
  useEffect(() => {
    let sent = 0;
    let windowStart = Date.now();

    const canSend = () => {
      const now = Date.now();
      if (now - windowStart > 60_000) {
        sent = 0;
        windowStart = now;
      }
      return sent < 10;
    };

    const onError = (event: ErrorEvent) => {
      if (!canSend()) return;
      sent += 1;
      void captureErrorClient({
        source: 'client',
        level: 'error',
        message: event.message || 'Error no capturado',
        name: event.error instanceof Error ? event.error.name : 'ErrorEvent',
        stack: event.error instanceof Error ? event.error.stack : undefined,
        route: window.location.pathname,
        context: {
          filename: event.filename,
          line: event.lineno,
          column: event.colno,
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!canSend()) return;
      sent += 1;
      const reason = event.reason;
      void captureErrorClient({
        source: 'client',
        level: 'error',
        message: reason instanceof Error ? reason.message : String(reason),
        name: reason instanceof Error ? reason.name : 'UnhandledRejection',
        stack: reason instanceof Error ? reason.stack : undefined,
        route: window.location.pathname,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}