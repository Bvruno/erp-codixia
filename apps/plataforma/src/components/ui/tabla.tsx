import type * as React from 'react';
import { cn } from '@/lib/utils';

function Tabla({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

function TablaEncabezado({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}

function TablaCuerpo({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TablaFila({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      className={cn('hover:bg-muted/40 border-b transition-colors', className)}
      {...props}
    />
  );
}

function TablaCabecera({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'text-muted-foreground h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap',
        className
      )}
      {...props}
    />
  );
}

function TablaCelda({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('p-3 align-middle', className)} {...props} />;
}

export { Tabla, TablaEncabezado, TablaCuerpo, TablaFila, TablaCabecera, TablaCelda };
