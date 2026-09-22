import { cn } from '@/lib/utils';

function CatFace({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Cabeza de gata (blanca) */}
      <path
        d="M16 13 L23 28 L41 28 L48 13 L55 31 Q57 45 44 53 Q32 58 20 53 Q7 45 9 31 Z"
        fill="#ffffff"
      />
      {/* Mancha oscura: oreja derecha + lateral */}
      <path
        d="M48 13 L41 28 L46 38 Q54 40 55 31 Q56 22 52 16 Z"
        fill="#26272b"
      />
      {/* Mancha naranja: oreja izquierda + lateral */}
      <path
        d="M16 13 L23 28 L18 38 Q10 40 9 31 Q8 22 12 16 Z"
        fill="#f59e0b"
      />
      {/* Mancha oscura: mejilla derecha */}
      <path
        d="M52 38 Q56 44 50 49 Q46 44 48 38 Z"
        fill="#26272b"
        opacity="0.9"
      />
      {/* Mancha naranja: mejilla izquierda */}
      <path
        d="M12 38 Q8 44 14 49 Q18 44 16 38 Z"
        fill="#f59e0b"
        opacity="0.95"
      />
      {/* Ojos */}
      <ellipse cx="26" cy="36" rx="3.4" ry="4.4" fill="#26272b" />
      <ellipse cx="38" cy="36" rx="3.4" ry="4.4" fill="#26272b" />
      {/* Nariz */}
      <path d="M30 43 L34 43 L32 46 Z" fill="#26272b" />
      {/* Bigotes */}
      <path
        d="M21 40 L11 38 M21 42.5 L11 42"
        stroke="#26272b"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M43 40 L53 38 M43 42.5 L53 42"
        stroke="#26272b"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

export function BrandMark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl bg-primary shadow-card ring-1 ring-black/5 dark:ring-white/10',
        size === 'sm' ? 'size-8' : 'size-9',
        className,
      )}
    >
      <CatFace className="size-[78%]" />
    </span>
  );
}

export function BrandWordmark({
  className,
  showTagline = true,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-display truncate text-[15px] font-bold tracking-tight text-foreground">
          ERP Codixia
        </span>
        {showTagline && (
          <span className="truncate text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Plataforma
          </span>
        )}
      </span>
    </span>
  );
}