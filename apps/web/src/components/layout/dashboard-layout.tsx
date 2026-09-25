"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/auth/actions";
import { cacheClearAll } from "@/lib/cache";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Calendar,
  FolderKanban,
  Kanban,
  Users,
  Clock,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ThemeToggle } from "./theme-toggle";
import { NotificationsBell } from "./notifications-bell";
import { CookieBanner } from "./cookie-banner";
import { BrandMark, BrandWordmark } from "./brand";
import { DEFAULT_PREFERENCES, type ProfilePreferences } from "@/types";
import { navBus } from "@/lib/nav-bus";
import { usePerfil } from "@/lib/use-perfil";
import { aplicarTema, suscribirTemaSistema } from "@/lib/tema";

const navSections = [
  {
    label: "Principal",
    items: [
      { name: "Calendario", href: "/calendario", icon: Calendar },
      { name: "Proyectos", href: "/proyectos", icon: FolderKanban },
      { name: "Pipeline", href: "/pipeline", icon: Kanban },
    ],
  },
  {
    label: "Equipo",
    items: [
      { name: "Colaboradores", href: "/colaboradores", icon: Users },
      { name: "Horarios", href: "/horarios", icon: Clock },
    ],
  },
];

const settingsNavigation = [
  { name: "Configuración", href: "/configuracion", icon: Settings },
];

function UserMenu({
  user,
  initials,
  collapsed,
}: {
  user: { email?: string; full_name?: string } | null;
  initials: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Menú de usuario"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent/50 transition-colors",
            collapsed ? "justify-center px-0 py-1" : "xl:justify-center xl:px-0"
          )}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 text-left xl:hidden">
              <p className="text-sidebar-foreground truncate text-sm font-medium">
                {user?.full_name || user?.email}
              </p>
            </div>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push("/perfil")}
          className="cursor-pointer"
        >
          <User className="size-4" />
          Mi Perfil
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            const result = await logout();
            queryClient.clear();
            await cacheClearAll();
            if (result?.redirect) router.push(result.redirect);
          }}
          className="text-destructive cursor-pointer"
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// La hidratación de perfil y calendario desde IndexedDB ocurre en el loader
// de `_aplicacion` (antes de que las páginas monten sus queries), por lo que
// aquí ya no hace falta repetirla.

export default function DashboardLayout({
  children,
  user,
  role,
  preferences,
}: {
  children: React.ReactNode;
  user: { email?: string; full_name?: string; is_owner?: boolean } | null;
  role?: string;
  preferences?: Partial<ProfilePreferences> | null;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);

  // Observa la caché compartida de /perfil (sin disparar GET): así los cambios
  // de preferencias guardados en la página de perfil se reflejan al instante.
  const perfilQuery = usePerfil({ enabled: false });
  const prefsGuardadas = perfilQuery.data?.profile?.preferences ?? preferences;
  const prefs = useMemo(
    () => ({
      ...DEFAULT_PREFERENCES,
      ...prefsGuardadas,
      notif: { ...DEFAULT_PREFERENCES.notif, ...(prefsGuardadas?.notif || {}) },
    }),
    [prefsGuardadas],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lectura SSR-safe de localStorage post-mount; patrón canónico (ver theme-toggle.tsx).
    setSidebarCollapsed(window.localStorage.getItem("sidebar-collapsed") === "1");
     
    setSidebarMounted(true);
  }, []);

  const collapsed = sidebarMounted && sidebarCollapsed;

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const isAdmin = role === 'admin' || user?.is_owner === true;
  const visibleSections = navSections.map((section) => ({
    ...section,
    items: isAdmin
      ? section.items
      : section.items.filter((item) => item.href !== '/colaboradores'),
  }));
  const visibleSettings = isAdmin ? settingsNavigation : [];

  useEffect(() => {
    aplicarTema(prefs.theme);
    document.documentElement.classList.toggle(
      "high-contrast",
      prefs.high_contrast,
    );
    document.documentElement.classList.toggle(
      "reduce-motion",
      prefs.reduce_motion,
    );
    document.documentElement.dataset.density = prefs.density;
    return suscribirTemaSistema(prefs.theme, (resuelto) => {
      document.documentElement.setAttribute("data-mode", resuelto);
    });
  }, [prefs]);

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || "U";

  type NavItem = (typeof navSections)[number]["items"][number];

  const activeClass = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const navLinkClass = (href: string) =>
    cn(
      "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
      prefs.density === "compact" && "py-1.5",
      activeClass(href)
        ? "font-semibold text-sidebar-foreground before:pointer-events-none before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary"
        : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    );

  const navLinks = (item: NavItem, onNavigate?: () => void) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={onNavigate}
      aria-current={activeClass(item.href) ? "page" : undefined}
      className={navLinkClass(item.href)}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="truncate">{item.name}</span>
    </Link>
  );

  return (
    <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* Sidebar - tablet/desktop full width */}
      <aside
        className={cn(
          "bg-sidebar border-sidebar-border hidden shrink-0 flex-col border-r md:flex transition-[width] duration-200 print:hidden",
          collapsed ? "w-14" : "w-64"
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-sidebar-border",
            collapsed ? "h-14 justify-center px-0" : "h-14 gap-2 px-3",
          )}
        >
          {collapsed ? (
            <BrandMark />
          ) : (
            <>
              <BrandWordmark className="flex-1" />
              <button
                onClick={toggleSidebar}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                aria-label="Ocultar navegación"
                title="Ocultar navegación"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {collapsed ? (
            <div className="flex flex-col items-center">
              {visibleSections.map((section, sectionIdx) => (
                <div
                  key={section.label}
                  className={cn(
                    "flex w-full flex-col items-center",
                    sectionIdx > 0 &&
                      "mt-2 border-t border-sidebar-border/70 pt-2",
                  )}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.name}
                        aria-label={item.name}
                        aria-current={activeClass(item.href) ? "page" : undefined}
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg transition-colors",
                          activeClass(item.href)
                            ? "text-sidebar-foreground ring-1 ring-inset ring-primary/60"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {visibleSettings.length > 0 && (
                <div className="mt-2 flex w-full flex-col items-center border-t border-sidebar-border/70 pt-2">
                  <div className="flex flex-col items-center gap-1.5">
                    {visibleSettings.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.name}
                        aria-label={item.name}
                        aria-current={activeClass(item.href) ? "page" : undefined}
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg transition-colors",
                          activeClass(item.href)
                            ? "text-sidebar-foreground ring-1 ring-inset ring-primary/60"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {visibleSections.map((section) => (
                <div key={section.label}>
                  <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50">
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={activeClass(item.href) ? "page" : undefined}
                        className={navLinkClass(item.href)}
                      >
                        <item.icon className="size-4 shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {visibleSettings.length > 0 && (
                <div>
                  <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50">
                    Sistema
                  </p>
                  <div className="space-y-0.5">
                    {visibleSettings.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={activeClass(item.href) ? "page" : undefined}
                        className={navLinkClass(item.href)}
                      >
                        <item.icon className="size-4 shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </nav>
        <div className="border-sidebar-border border-t p-2 space-y-2">
          <div
            className={cn(
              "flex items-center justify-between px-1",
              collapsed && "flex-col gap-1",
            )}
          >
            <ThemeToggle tema={prefs.theme} className={collapsed ? "size-9" : undefined} />
            <NotificationsBell
              className={collapsed ? "size-9" : undefined}
            />
            {collapsed && (
              <button
                onClick={toggleSidebar}
                aria-label="Expandir navegación"
                title="Expandir navegación"
                className="flex size-9 items-center justify-center rounded-xl text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            )}
          </div>
          <UserMenu user={user} initials={initials} collapsed={collapsed} />
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col overflow-hidden print:block print:overflow-visible">
        <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Abrir menú"
                  aria-expanded={mobileMenuOpen}
                  onClick={() => setMobileMenuOpen((v) => !v)}
                  className="text-muted-foreground hover:text-primary flex size-9 items-center justify-center rounded-md pointer-coarse:size-11"
                >
                  {mobileMenuOpen ? (
                    <X className="size-5" />
                  ) : (
                    <Menu className="size-5" />
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-sidebar-border flex h-16 flex-row items-center gap-2 border-b px-4 pr-12">
                  <SheetTitle className="sr-only">ERP Codixia</SheetTitle>
                  <BrandWordmark showTagline={false} />
                </SheetHeader>
                <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
                  <nav className="flex-1 space-y-2 overflow-y-auto p-3">
                    {visibleSections.map((section) => (
                      <div key={section.label}>
                        <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50">
                          {section.label}
                        </p>
                        <div className="space-y-0.5">
                          {section.items.map((item) =>
                            navLinks(item, () => setMobileMenuOpen(false)),
                          )}
                        </div>
                      </div>
                    ))}
                  </nav>
                  {visibleSettings.length > 0 && (
                    <div className="border-t border-sidebar-border px-3 py-3">
                      <nav className="space-y-0.5">
                        {visibleSettings.map((item) =>
                          navLinks(item, () => setMobileMenuOpen(false)),
                        )}
                      </nav>
                    </div>
                  )}
                  <div className="border-sidebar-border mt-auto border-t p-3">
                    <div className="flex items-center justify-between px-1 pb-2">
                      <ThemeToggle tema={prefs.theme} />
                      {<NotificationsBell />}
                    </div>
                    <UserMenu user={user} initials={initials} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <BrandWordmark showTagline={false} className="min-w-0 flex-1" />
          </div>
          <div className="flex items-center gap-2">
            {pathname.startsWith("/proyectos") && (
              <button
                onClick={() => navBus.toggleDrawer()}
                aria-label="Espacios de trabajo"
                title="Espacios de trabajo"
                className="text-muted-foreground hover:text-primary flex size-9 items-center justify-center rounded-md pointer-coarse:size-11"
              >
                <PanelLeftOpen className="size-5" />
              </button>
            )}
            <ThemeToggle tema={prefs.theme} />
            {<NotificationsBell />}
          </div>
        </header>

        {/* Main content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto bg-background page-enter print:h-auto print:overflow-visible print:bg-white print:p-0",
            prefs.density === "compact" ? "p-3 sm:p-4" : "p-4 sm:p-6",
          )}
        >
          {children}
        </main>
      </div>
      <CookieBanner />
    </div>
  );
}
