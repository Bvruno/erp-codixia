import { useState, type ReactNode } from 'react';
import { Link, Outlet, useRouter } from '@tanstack/react-router';
import {
  BarChart3,
  Building2,
  CreditCard,
  Inbox,
  LogOut,
  Moon,
  ScrollText,
  Shield,
  Sun,
  Ticket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth/actions';
import { aplicarTema, temaActual, type Tema } from '@/lib/tema';
import { cn } from '@/lib/utils';

const NAVEGACION = [
  { to: '/', etiqueta: 'Resumen', icono: BarChart3 },
  { to: '/solicitudes', etiqueta: 'Solicitudes', icono: Inbox },
  { to: '/empresas', etiqueta: 'Empresas', icono: Building2 },
  { to: '/planes', etiqueta: 'Planes', icono: Ticket },
  { to: '/facturas', etiqueta: 'Facturación', icono: CreditCard },
  { to: '/admins', etiqueta: 'Administradores', icono: Shield },
  { to: '/auditoria', etiqueta: 'Auditoría', icono: ScrollText },
] as const;

export function PanelLayout({ email, children }: { email: string | null; children?: ReactNode }) {
  const router = useRouter();
  const [tema, setTema] = useState<Tema>(temaActual());

  function alternarTema() {
    const siguiente: Tema = tema === 'dark' ? 'light' : 'dark';
    aplicarTema(siguiente);
    setTema(siguiente);
  }

  async function salir() {
    const res = await logout();
    if (res.redirect) await router.navigate({ to: res.redirect });
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="bg-card hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-xs font-bold">
            ERP
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Plataforma</p>
            <p className="text-muted-foreground text-[11px]">Administración de owners</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAVEGACION.map(({ to, etiqueta, icono: Icono }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                'text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors'
              )}
              activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
              activeOptions={{ exact: to === '/' }}
            >
              <Icono className="size-4" />
              {etiqueta}
            </Link>
          ))}
        </nav>
        <div className="space-y-2 border-t p-3">
          <p className="text-muted-foreground truncate px-1 text-xs">{email ?? 'Sin sesión'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={alternarTema} className="flex-1">
              {tema === 'dark' ? <Sun /> : <Moon />}
              Tema
            </Button>
            <Button variant="ghost" size="sm" onClick={salir}>
              <LogOut />
              Salir
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-card flex h-14 items-center justify-between border-b px-4 md:hidden">
          <span className="text-sm font-semibold">Plataforma</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={alternarTema}>
              {tema === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <Button variant="ghost" size="sm" onClick={salir}>
              <LogOut />
            </Button>
          </div>
        </header>
        <nav className="bg-card flex gap-1 overflow-x-auto border-b p-2 md:hidden">
          {NAVEGACION.map(({ to, etiqueta }) => (
            <Link
              key={to}
              to={to}
              className="text-muted-foreground hover:text-foreground shrink-0 rounded-md px-3 py-1.5 text-xs"
              activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
              activeOptions={{ exact: to === '/' }}
            >
              {etiqueta}
            </Link>
          ))}
        </nav>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      {children}
    </div>
  );
}
