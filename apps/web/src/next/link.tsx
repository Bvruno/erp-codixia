import { useNavigate } from '@tanstack/react-router';
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

interface EnlaceProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

// Shim de next/link → <a> con navegación de TanStack Router.
// Acepta todas las props HTML nativas (aria-*, title, style, eventos).
export default function Link({ href, children, onClick, ...rest }: EnlaceProps) {
  const navigate = useNavigate();
  const manejarClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate({ to: href });
  };
  return (
    <a href={href} onClick={manejarClick} {...rest}>
      {children}
    </a>
  );
}