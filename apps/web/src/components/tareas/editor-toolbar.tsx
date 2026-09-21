'use client';

import { cn } from '@/lib/utils';

export function ToolbarButton({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-40',
        active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

export function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px bg-border" />;
}
