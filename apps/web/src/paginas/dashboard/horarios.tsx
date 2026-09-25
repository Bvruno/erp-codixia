"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { canalRealtime, removerCanal } from '@/lib/realtime';
import { usePerfil } from '@/lib/use-perfil';
import { aplicarEventoLista, leerEvento, parchearQuery } from '@/lib/realtime-cache';
import { api, apiFetch } from "@/lib/api/cliente";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import {
  Clock,
  Plus,
  AlertTriangle,
  Download,
  RefreshCw,
  CalendarDays,
  Table2,
  CalendarRange,
  TrendingUp,
  CalendarClock,
  Loader2,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { computeHours } from "@/lib/hours";
import { DEFAULT_PREFERENCES } from "@/types";
import type {
  Profile,
  TimeEntry,
  Permission,
  OrgSettings,
  Schedule,
} from "@/types";
import { RegistroHorasDialog } from "./registro-horas-dialog";
import { EntradasTabla } from "./entradas-tabla";
import { HeatmapHoras } from "./heatmap";
import { GrillaSemanal } from "./grilla-semanal";
import { CabeceraEntidad } from "@/components/entidad/cabecera-entidad";

type Period = "week" | "month" | "custom";

type HorariosData = {
  collaborators: Profile[];
  time_entries: TimeEntry[];
  permissions: Permission[];
  org_settings: OrgSettings | null;
  schedules: Schedule[];
  trend_entries: TimeEntry[];
};

export default function HorariosPage() {
  const perfilQuery = usePerfil();
  const profile = perfilQuery.data?.profile ?? null;
  const [collaborators, setCollaborators] = useState<Profile[]>([]);
  const [trendEntries, setTrendEntries] = useState<TimeEntry[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  // Solo cambian tras 400ms sin teclear: evita 2 GET por pulsación.
  const [customStartAplicado, setCustomStartAplicado] = useState("");
  const [customEndAplicado, setCustomEndAplicado] = useState("");
  const debounceCustomRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actualizarCustom = (patch: { start?: string; end?: string }) => {
    if (patch.start !== undefined) setCustomStart(patch.start);
    if (patch.end !== undefined) setCustomEnd(patch.end);
    if (debounceCustomRef.current) clearTimeout(debounceCustomRef.current);
    debounceCustomRef.current = setTimeout(() => {
      if (patch.start !== undefined) setCustomStartAplicado(patch.start);
      if (patch.end !== undefined) setCustomEndAplicado(patch.end);
    }, 400);
  };
  useEffect(() => () => {
    if (debounceCustomRef.current) clearTimeout(debounceCustomRef.current);
  }, []);
  const [filterUser, setFilterUser] = useState("all");
  const [showPermission, setShowPermission] = useState(false);
  const [enviandoPermiso, setEnviandoPermiso] = useState(false);
  const [permissionForm, setPermissionForm] = useState({
    reason: "",
    date: "",
    estimated_hours: "",
    makeup_date: "",
  });

  const queryClient = useQueryClient();
  const horariosQuery = useQuery({
    queryKey: ['horarios', 'datos', period, customStartAplicado, customEndAplicado],
    queryFn: async () => {
      if (!profile) throw new Error("Perfil no encontrado");

      const weekPref =
        (profile.preferences as { week_start?: "monday" | "sunday" } | null)
          ?.week_start ?? DEFAULT_PREFERENCES.week_start;
      const weekStartsOn = weekPref === "monday" ? 1 : 0;
      const range = rangeFor(period, weekStartsOn, customStartAplicado, customEndAplicado);
      const trendDesde = format(
        subWeeks(startOfWeek(new Date(), { weekStartsOn }), 7),
        "yyyy-MM-dd"
      );

      const res = await apiFetch<{
        collaborators: Profile[];
        time_entries: TimeEntry[];
        permissions: Permission[];
        org_settings: OrgSettings | null;
        schedules: Schedule[];
        trend_entries: TimeEntry[];
      }>(
        `/horarios/datos?inicio=${encodeURIComponent(range.start)}&fin=${encodeURIComponent(range.end)}&tendencia_desde=${encodeURIComponent(trendDesde)}`
      );

      return res;
    },
    enabled: !!profile,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    if (!horariosQuery.data) return;
    const res = horariosQuery.data;
    setCollaborators(res.collaborators);
    setTimeEntries(res.time_entries);
    setPermissions(res.permissions);
    setOrgSettings(res.org_settings);
    setSchedules(res.schedules);
    setTrendEntries(res.trend_entries);
    setError(null);
    setLoading(false);
  }, [horariosQuery.data]);
  useEffect(() => {
    if (!horariosQuery.isError) return;
    setError(horariosQuery.error instanceof Error ? horariosQuery.error.message : "Error cargando datos");
    setLoading(false);
  }, [horariosQuery.isError, horariosQuery.error]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const refetchHorarios = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['horarios', 'datos'] });
  }, [queryClient]);

  // Aplica el evento a la caché para que las tablas cambien al instante.
  const aplicarEventoHorarios = useCallback(
    (payload: unknown) => {
      const evt = leerEvento<Record<string, unknown>>(payload);
      if (!evt || (evt.table !== 'time_entries' && evt.table !== 'permissions')) {
        refetchHorarios();
        return;
      }
      const key = ['horarios', 'datos', period, customStartAplicado, customEndAplicado] as const;
      let aplicado = false;
      parchearQuery<HorariosData>(queryClient, key, (data) => {
        if (evt.table === 'time_entries') {
          const r = aplicarEventoLista<TimeEntry>(data.time_entries, evt);
          if (!r.aplicado || !r.lista) return data;
          aplicado = true;
          return { ...data, time_entries: r.lista };
        }
        const r = aplicarEventoLista<Permission>(data.permissions, evt);
        if (!r.aplicado || !r.lista) return data;
        aplicado = true;
        return { ...data, permissions: r.lista };
      });
      if (!aplicado) refetchHorarios();
    },
    [queryClient, refetchHorarios, period, customStartAplicado, customEndAplicado]
  );

  useEffect(() => {
    if (!profile) return;
    const channel = canalRealtime("horarios-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_entries",
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        aplicarEventoHorarios,
      )
      // Los DELETE no son filtrables: listeners sin filtro resueltos por id.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "time_entries" }, aplicarEventoHorarios)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "permissions",
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        aplicarEventoHorarios,
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "permissions" }, aplicarEventoHorarios)
      .subscribe();
    return () => {
      removerCanal(channel);
    };
  }, [profile, aplicarEventoHorarios]);

  const submitPermission = async () => {
    if (enviandoPermiso) return;
    if (!profile || !permissionForm.reason.trim() || !permissionForm.date) {
      toast.error("Completa motivo y fecha");
      return;
    }
    const hours = parseFloat(permissionForm.estimated_hours);
    if (!hours || hours <= 0) {
      toast.error("Indica horas estimadas válidas");
      return;
    }
    setEnviandoPermiso(true);
    try {
      await api.post("/horarios/permisos", {
        organization_id: profile.organization_id,
        user_id: profile.id,
        reason: permissionForm.reason.trim(),
        date: permissionForm.date,
        estimated_hours: hours,
        makeup_date: permissionForm.makeup_date || null,
      });
    } catch {
      toast.error("No se pudo enviar la solicitud");
      return;
    } finally {
      setEnviandoPermiso(false);
    }
    toast.success("Permiso solicitado");
    setShowPermission(false);
    setPermissionForm({
      reason: "",
      date: "",
      estimated_hours: "",
      makeup_date: "",
    });
    refetchHorarios();
  };

  const updatePermissionStatus = async (
    permId: string,
    status: "approved" | "rejected",
  ) => {
    const perm = permissions.find((p) => p.id === permId);
    try {
      await api.patch(`/horarios/permisos/${permId}`, { status });
    } catch {
      toast.error("No se pudo actualizar el estado");
      return;
    }
    if (profile) {
      await api.post("/auditoria", {
        organization_id: profile.organization_id,
        action: status === "approved" ? "approve_permission" : "reject_permission",
        entity: "permission",
        before: perm ?? null,
        after: { status },
      }).catch(() => undefined);
    }
    toast.success(
      status === "approved" ? "Permiso aprobado" : "Permiso rechazado",
    );
    refetchHorarios();
  };

  const exportHoursCSV = () => {
    const users = visibleUsers();
    const headers = [
      "Nombre",
      "Trabajado",
      "Extra",
      "Recuperación",
      "Eximido por permiso",
      "Debe",
    ];
    const rows = users.map((user) => {
      const s = summaryFor(user);
      return [
        user.full_name,
        s.worked.toFixed(1),
        s.overtime.toFixed(1),
        s.makeup.toFixed(1),
        s.exempt.toFixed(1),
        s.owed.toFixed(1),
      ].join(";");
    });
    const csv = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `horas-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const isAdmin = profile?.role === "admin";
  const now = new Date();
  const weekPref =
    (profile?.preferences as { week_start?: "monday" | "sunday" } | null)
      ?.week_start ?? DEFAULT_PREFERENCES.week_start;
  const weekStartsOn = weekPref === "monday" ? 1 : 0;
  const weekStart = startOfWeek(now, { weekStartsOn });
  const weekEnd = endOfWeek(now, { weekStartsOn });
  const { start: rangeStart, end: rangeEnd } = rangeFor(
    period,
    weekStartsOn,
    customStartAplicado,
    customEndAplicado,
  );

  const visibleUsers = (): Profile[] => {
    const base = isAdmin ? collaborators : [profile];
    const list = base.filter(Boolean) as Profile[];
    if (isAdmin && filterUser !== "all") {
      return list.filter((u) => u.id === filterUser);
    }
    return list;
  };

  // Tendencia: horas trabajadas por semana (8 semanas) por persona
  const trendUsers = isAdmin
    ? filterUser === "all"
      ? collaborators
      : collaborators.filter((c) => c.id === filterUser)
    : profile
      ? [profile]
      : [];
  const trendWeeks = Array.from({ length: 8 }).map((_, i) => {
    const ws = startOfWeek(subWeeks(now, 7 - i), { weekStartsOn });
    return {
      start: format(ws, "yyyy-MM-dd"),
      end: format(endOfWeek(ws, { weekStartsOn }), "yyyy-MM-dd"),
      label: format(ws, "dd/MM"),
    };
  });
  const trendByUser = trendUsers.map((u) => ({
    user: u,
    bars: trendWeeks.map(
      (w) =>
        trendEntries
          .filter(
            (e) =>
              e.user_id === u.id &&
              e.type === "worked" &&
              e.date >= w.start &&
              e.date <= w.end,
          )
          .reduce((acc, e) => acc + Number(e.hours), 0),
    ),
  }));
  const trendMax = Math.max(1, ...trendByUser.flatMap((t) => t.bars));

  // Permisos futuros (próximas ausencias)
  const futurePermissions = permissions
    .filter(
      (p) => p.status !== "rejected" && p.date >= format(now, "yyyy-MM-dd"),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const summaryFor = (user: Profile) =>
    computeHours({
      entries: timeEntries,
      permissions,
      userId: user.id,
      start: new Date(rangeStart + "T00:00:00"),
      end: new Date(rangeEnd + "T00:00:00"),
      target: user.weekly_hours || 40,
    });

  if (loading) {
    return <CardSkeleton count={3} />;
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            refetchHorarios();
          }}
        >
          <RefreshCw className="size-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CabeceraEntidad titulo="Horarios" />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-36">
              <CalendarRange className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <Input
                type="date"
                className="w-40"
                value={customStart}
                onChange={(e) => actualizarCustom({ start: e.target.value })}
              />
              <Input
                type="date"
                className="w-40"
                value={customEnd}
                onChange={(e) => actualizarCustom({ end: e.target.value })}
              />
            </>
          )}
          {isAdmin && (
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {collaborators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={exportHoursCSV}>
            <Download className="size-4" />
            Exportar
          </Button>
          <RegistroHorasDialog
            orgId={profile?.organization_id ?? ""}
            isAdmin={isAdmin}
            collaborators={collaborators}
            onSaved={refetchHorarios}
          />
          {!isAdmin && (
            <Dialog open={showPermission} onOpenChange={(open) => { if (!open && enviandoPermiso) return; setShowPermission(open); }}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Clock className="size-4" />
                  Solicitar permiso
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Solicitar permiso</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="permiso-motivo">Motivo</Label>
                    <Textarea
                      id="permiso-motivo"
                      value={permissionForm.reason}
                      onChange={(e) =>
                        setPermissionForm({
                          ...permissionForm,
                          reason: e.target.value,
                        })
                      }
                      placeholder="Razón del permiso..."
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="permiso-fecha">Fecha</Label>
                      <Input
                        id="permiso-fecha"
                        type="date"
                        value={permissionForm.date}
                        onChange={(e) =>
                          setPermissionForm({
                            ...permissionForm,
                            date: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="permiso-horas">Horas estimadas fuera</Label>
                      <Input
                        id="permiso-horas"
                        type="number"
                        value={permissionForm.estimated_hours}
                        onChange={(e) =>
                          setPermissionForm({
                            ...permissionForm,
                            estimated_hours: e.target.value,
                          })
                        }
                        placeholder="4"
                        step="0.5"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="permiso-recuperacion">Fecha de recuperación (opcional)</Label>
                    <Input
                      id="permiso-recuperacion"
                      type="date"
                      value={permissionForm.makeup_date}
                      onChange={(e) =>
                        setPermissionForm({
                          ...permissionForm,
                          makeup_date: e.target.value,
                        })
                      }
                    />
                  </div>
                  <Button className="w-full" onClick={submitPermission} disabled={enviandoPermiso}>
                    {enviandoPermiso ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Enviando…
                      </>
                    ) : (
                      "Enviar solicitud"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarDays className="size-4" />
        {format(rangeStart, "dd MMM")} – {format(rangeEnd, "dd MMM yyyy")}
        {orgSettings && (
          <span className="ml-auto">
            Límites org: {orgSettings.daily_hours}h/día ·{" "}
            {orgSettings.weekly_hours}h/semana
          </span>
        )}
      </div>

      {/* Hours Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        {visibleUsers().map((user) => {
          const s = summaryFor(user);
          const weeklyTarget = user.weekly_hours || 40;
          const weeklyPct = Math.min(
            Math.round(((s.worked + s.exempt) / weeklyTarget) * 100),
            100,
          );

          return (
            <Card key={user.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback>
                      {user.full_name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{user.full_name}</p>
                    <p className="text-muted-foreground text-xs">
                      {user.role === "admin" ? "Admin" : "Colaborador"}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>
                        Semanal ({s.worked.toFixed(1)}/{weeklyTarget}h)
                      </span>
                      <span>{weeklyPct}%</span>
                    </div>
                    <div className="bg-muted h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          weeklyPct >= 100
                            ? "bg-success"
                            : weeklyPct >= 70
                              ? "bg-info"
                              : "bg-orange-500"
                        }`}
                        style={{ width: `${weeklyPct}%` }}
                      />
                    </div>
                    {weeklyPct < 70 && weeklyPct > 0 && (
                      <p className="text-warning mt-1 text-xs">
                        Bajo la meta semanal
                      </p>
                    )}
                    {weeklyPct > 110 && (
                      <p className="text-purple-500 mt-1 text-xs">
                        Sobre la meta semanal
                      </p>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs flex justify-between">
                    <span>
                      Mensual:{" "}
                      {computeHours({
                        entries: timeEntries,
                        permissions,
                        userId: user.id,
                        start: startOfMonth(now),
                        end: endOfMonth(now),
                        target: user.weekly_hours || 40,
                      }).worked.toFixed(1)}
                      h
                    </span>
                    <span>Diario: {user.daily_hours || 8}h</span>
                  </div>
                  {s.overtime > 0 && (
                    <div className="text-purple-400 text-xs flex items-center gap-1">
                      <Plus className="size-3" />
                      Extra: {s.overtime.toFixed(1)}h
                    </div>
                  )}
                  {s.exempt > 0 && (
                    <div className="text-success text-xs">
                      Eximido por permisos: {s.exempt.toFixed(1)}h
                    </div>
                  )}
                  {s.pendingMakeup && (
                    <div className="text-warning text-xs flex items-center gap-1">
                      <AlertTriangle className="size-3" />
                      Recuperación pendiente: {s.pendingMakeupHours.toFixed(1)}h
                    </div>
                  )}
                  {s.owed > 0 ? (
                    <div className="text-orange-400 text-xs flex items-center gap-1">
                      <AlertTriangle className="size-3" />
                      Debe {s.owed.toFixed(1)}h en el período
                    </div>
                  ) : (
                    <div className="text-success text-xs">
                      Al día en el período
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Table2 className="size-4" />
              Semana actual por colaborador
            </CardTitle>
            <CardDescription>
              Horas registradas del {format(weekStart, "dd MMM")} al{" "}
              {format(weekEnd, "dd MMM yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GrillaSemanal
              entries={timeEntries}
              schedules={schedules}
              collaborators={
                filterUser === "all"
                  ? collaborators
                  : collaborators.filter((c) => c.id === filterUser)
              }
              weekStart={weekStart}
              dailyTarget={8}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4" />
            Tendencia · horas trabajadas por semana
          </CardTitle>
          <CardDescription>Últimas 8 semanas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {trendByUser.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin datos en las últimas 8 semanas
            </p>
          ) : (
            trendByUser.map(({ user, bars }) => (
              <div key={user.id}>
                <p className="mb-1 text-xs font-medium">{user.full_name}</p>
                <div className="flex h-16 items-end gap-1.5">
                  {bars.map((h, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {Math.round(h)}
                      </span>
                      <div
                        className="w-full rounded-sm bg-info/70"
                        style={{ height: `${Math.max(3, (h / trendMax) * 48)}px` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-0.5 flex justify-between text-xs text-muted-foreground">
                  {trendWeeks.map((w, i) => (
                    <span key={i}>{w.label}</span>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="size-4" />
            {format(now, "MMMM yyyy", { locale: es })}
          </CardTitle>
          <CardDescription>
            Horas registradas por día vs meta diaria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HeatmapHoras
            entries={timeEntries}
            month={startOfMonth(now)}
            dailyTarget={8}
          />
        </CardContent>
      </Card>

      {/* Time Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entradas de horas</CardTitle>
          <CardDescription>
            {timeEntries.length} registros en el período
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : (
            <EntradasTabla
              orgId={profile?.organization_id ?? ""}
              entries={timeEntries}
              isAdmin={isAdmin}
              currentUserId={profile?.id ?? ""}
              onChanged={refetchHorarios}
            />
          )}
        </CardContent>
      </Card>

      {/* Permissions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Permisos
            {isAdmin && (
              <span className="text-muted-foreground font-normal text-sm ml-2">
                ({permissions.filter((p) => p.status === "pending").length}{" "}
                pendientes)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {permissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="size-8 mb-2 opacity-50" />
              <p className="text-sm">No hay solicitudes de permiso</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && <TableHead>Solicitante</TableHead>}
                  <TableHead>Motivo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Recuperación</TableHead>
                  <TableHead>Estado</TableHead>
                  {isAdmin && <TableHead>Acción</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((perm) => (
                  <TableRow key={perm.id}>
                    {isAdmin && (
                      <TableCell className="text-sm">
                        {perm.user?.full_name}
                      </TableCell>
                    )}
                    <TableCell className="text-sm max-w-40 truncate">
                      {perm.reason}
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(perm.date + "T00:00:00"), "dd/MM/yy")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {perm.estimated_hours}h
                    </TableCell>
                    <TableCell className="text-sm">
                      {perm.makeup_date
                        ? format(
                            new Date(perm.makeup_date + "T00:00:00"),
                            "dd/MM/yy",
                          )
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          perm.status === "approved"
                            ? "bg-success/20 text-success"
                            : perm.status === "rejected"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/20 text-warning"
                        }
                      >
                        {perm.status === "approved"
                          ? "Aprobado"
                          : perm.status === "rejected"
                            ? "Rechazado"
                            : "Pendiente"}
                      </Badge>
                    </TableCell>
                    {isAdmin && perm.status === "pending" && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-success h-8"
                            onClick={() =>
                              updatePermissionStatus(perm.id, "approved")
                            }
                          >
                            Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive h-8"
                            onClick={() =>
                              updatePermissionStatus(perm.id, "rejected")
                            }
                          >
                            Rechazar
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Próximas ausencias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="size-4" />
            Próximas ausencias
          </CardTitle>
          <CardDescription>Permisos desde hoy en adelante</CardDescription>
        </CardHeader>
        <CardContent>
          {futurePermissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin ausencias programadas
            </p>
          ) : (
            <div className="space-y-2">
              {futurePermissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {perm.user?.full_name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(perm.date + "T00:00:00"), "dd MMM")}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {perm.estimated_hours}h
                  </span>
                  <Badge
                    className={
                      perm.status === "approved"
                        ? "bg-success/20 text-success"
                        : "bg-warning/20 text-warning"
                    }
                  >
                    {perm.status === "approved" ? "Aprobado" : "Pendiente"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function rangeFor(
  period: Period,
  weekStartsOn: 0 | 1,
  customStart: string,
  customEnd: string,
): { start: string; end: string } {
  const now = new Date();
  if (period === "month") {
    return {
      start: format(startOfMonth(now), "yyyy-MM-dd"),
      end: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  }
  if (period === "custom") {
    return {
      start:
        customStart || format(startOfWeek(now, { weekStartsOn }), "yyyy-MM-dd"),
      end: customEnd || format(endOfWeek(now, { weekStartsOn }), "yyyy-MM-dd"),
    };
  }
  return {
    start: format(startOfWeek(now, { weekStartsOn }), "yyyy-MM-dd"),
    end: format(endOfWeek(now, { weekStartsOn }), "yyyy-MM-dd"),
  };
}

