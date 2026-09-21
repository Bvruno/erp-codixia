"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cacheSet, notificarCambioCache } from '@/lib/cache';
import { INDICE_PERFIL, clavePerfil, clavePreferencias } from '@/lib/cache-claves';
import { useClaveConIndice } from '@/lib/use-cache-hidratacion';
import { usePerfil, type PerfilPayload } from '@/lib/use-perfil';
import { useAutoguardado } from '@/lib/use-autoguardado';
import { aplicarTema } from '@/lib/tema';
import { api } from "@/lib/api/cliente";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarraEstadoGuardado } from "@/components/layout/estado-guardado";
import {
  User,
  SlidersHorizontal,
  Globe,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { hasSchedule } from "@/lib/schedules";
import type {
  EmergencyContact,
  Profile,
  ProfilePreferences,
  Schedule,
  ThemePreference,
} from "@/types";
import { DEFAULT_PREFERENCES } from "@/types";

const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

function PrefCheckbox({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border px-3 py-2.5">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(c) => onChange(Boolean(c))}
      />
      <div className="flex-1">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </div>
    </div>
  );
}

export default function PerfilPage() {
  const [loading, setLoading] = useState(true);
  const [nombreTocado, setNombreTocado] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgLimits, setOrgLimits] = useState<{
    daily_hours: number;
    weekly_hours: number;
  } | null>(null);
  const [orgOwnerId, setOrgOwnerId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [form, setForm] = useState({
    full_name: "",
    position: "",
    phone: "",
    bio: "",
    birth_date: "",
    address: "",
    alternate_phones: [""] as string[],
    emergency_contacts: [] as EmergencyContact[],
    daily_hours: 8,
    weekly_hours: 40,
  });
  const [prefs, setPrefs] = useState<ProfilePreferences>(DEFAULT_PREFERENCES);

  const mergePrefs = (saved: Partial<ProfilePreferences> | null) => ({
    ...DEFAULT_PREFERENCES,
    ...saved,
    notif: { ...DEFAULT_PREFERENCES.notif, ...(saved?.notif || {}) },
  });

  const queryClient = useQueryClient();
  const { clave: claveCachePerfil, fijar: fijarPerfilCache } = useClaveConIndice(
    INDICE_PERFIL,
    clavePerfil
  );
  const perfilQuery = usePerfil();
  // (hidratación y persistencia centralizadas en _aplicacion + main.tsx)

  const hoursLocked = () => {
    if (!profile) return false;
    if (orgOwnerId && profile.id === orgOwnerId) return false;
    return hasSchedule(schedules, profile.id);
  };

  const guardarPersonal = useCallback(async () => {
    const datos = {
      full_name: form.full_name.trim(),
      position: form.position.trim() || null,
      phone: form.phone.trim() || null,
      bio: form.bio.trim() || null,
      birth_date: form.birth_date || null,
      address: form.address.trim() || null,
      alternate_phones: form.alternate_phones
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
      emergency_contacts: form.emergency_contacts.filter(
        (c) => c.name.trim() || c.phone.trim(),
      ),
    };
    await api.patch("/perfil", datos);
    queryClient.setQueryData<PerfilPayload>(["perfil", "datos"], (old) =>
      old?.profile ? { ...old, profile: { ...old.profile, ...datos } } : old,
    );
    if (claveCachePerfil) notificarCambioCache([claveCachePerfil]);
  }, [form, queryClient, claveCachePerfil]);

  const guardarVariables = useCallback(async () => {
    const horas = {
      daily_hours: form.daily_hours,
      weekly_hours: form.weekly_hours,
    };
    await api.patch("/perfil/horas", horas);
    queryClient.setQueryData<PerfilPayload>(["perfil", "datos"], (old) =>
      old?.profile ? { ...old, profile: { ...old.profile, ...horas } } : old,
    );
    if (claveCachePerfil) notificarCambioCache([claveCachePerfil]);
  }, [form.daily_hours, form.weekly_hours, queryClient, claveCachePerfil]);

  const guardarPreferencias = useCallback(async () => {
    await api.put("/perfil/preferencias", { preferences: prefs });
    queryClient.setQueryData<PerfilPayload>(["perfil", "datos"], (old) =>
      old?.profile
        ? { ...old, profile: { ...old.profile, preferences: prefs } }
        : old,
    );
    if (profile?.id) {
      void cacheSet(clavePreferencias(profile.id), prefs);
      notificarCambioCache([clavePreferencias(profile.id)]);
    }
  }, [prefs, queryClient, profile]);

  const autoguardadoPersonal = useAutoguardado(guardarPersonal, {
    onError: () => toast.error("No se pudo guardar el perfil"),
  });
  const autoguardadoVariables = useAutoguardado(guardarVariables, {
    onError: () => toast.error("No se pudieron guardar las variables"),
  });
  const autoguardadoPreferencias = useAutoguardado(guardarPreferencias, {
    debounceMs: 400,
    onError: () => toast.error("No se pudieron guardar las preferencias"),
  });

  // Con cambios sin guardar no se sincroniza la query al formulario: un
  // refetch externo (u otra pestaña) pisaría lo que el usuario está editando.
  const sinGuardar =
    autoguardadoPersonal.estado !== "guardado" ||
    autoguardadoVariables.estado !== "guardado" ||
    autoguardadoPreferencias.estado !== "guardado";

  /* eslint-disable react-hooks/set-state-in-effect -- Sync de query a estado local */
  useEffect(() => {
    const data = perfilQuery.data;
    if (!data || sinGuardar) return;
    setEmail(data.email);
    const profile = data.profile ?? null;
    if (!profile) {
      setLoading(false);
      return;
    }
    setProfile(profile);
    setForm({
      full_name: profile.full_name,
      position: profile.position || "",
      phone: profile.phone || "",
      bio: profile.bio || "",
      birth_date: profile.birth_date || "",
      address: profile.address || "",
      alternate_phones:
        profile.alternate_phones && profile.alternate_phones.length > 0
          ? profile.alternate_phones
          : [""],
      emergency_contacts: profile.emergency_contacts || [],
      daily_hours: profile.daily_hours,
      weekly_hours: profile.weekly_hours,
    });
    if (data?.organization) {
      setOrgName(data.organization.name);
      setOrgOwnerId(data.organization.owner_id);
    }
    if (data?.org_settings) setOrgLimits(data.org_settings);
    setSchedules(data?.schedules ?? []);
    const savedPrefs = mergePrefs(profile.preferences);
    setPrefs(savedPrefs);
    aplicarTema(savedPrefs.theme);
    setLoading(false);
    // Deja lista la clave de cache para la próxima recarga (hidratación).
    fijarPerfilCache(profile.id);
  }, [perfilQuery.data, fijarPerfilCache, sinGuardar]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const nombreInvalido = !form.full_name.trim();

  const actualizarPersonal = (cambios: Partial<typeof form>) => {
    const siguiente = { ...form, ...cambios };
    setForm(siguiente);
    if (!siguiente.full_name.trim()) {
      setNombreTocado(true);
      return;
    }
    autoguardadoPersonal.marcarSucio();
  };

  const horasInvalidas =
    form.daily_hours < 1 ||
    form.daily_hours > 24 ||
    form.weekly_hours < 1 ||
    form.weekly_hours > 168;

  const actualizarHoras = (
    cambios: Partial<Pick<typeof form, "daily_hours" | "weekly_hours">>,
  ) => {
    const siguiente = { ...form, ...cambios };
    setForm(siguiente);
    const invalido =
      siguiente.daily_hours < 1 ||
      siguiente.daily_hours > 24 ||
      siguiente.weekly_hours < 1 ||
      siguiente.weekly_hours > 168;
    if (!invalido) autoguardadoVariables.marcarSucio();
  };

  const actualizarPrefs = (siguiente: ProfilePreferences) => {
    setPrefs(siguiente);
    autoguardadoPreferencias.marcarSucio();
  };

  const initials = (form.full_name || profile?.full_name || email)
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-16 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {initials || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">
                {form.full_name || "Usuario"}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                <Badge variant="secondary">
                  {profile?.role === "admin" ? "Administrador" : "Colaborador"}
                </Badge>
                {orgName && <span>{orgName}</span>}
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:min-w-0 lg:flex-1 lg:max-w-[30rem]">
            <div className="min-w-0">
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Email
              </dt>
              <dd className="mt-1 truncate text-sm font-medium">
                {email || "—"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Puesto
              </dt>
              <dd className="mt-1 truncate text-sm font-medium">
                {form.position || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Horas/día
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {form.daily_hours} h
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Horas/semana
              </dt>
              <dd className="mt-1 text-sm font-medium">
                {form.weekly_hours} h
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">
            <User className="size-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="variables">
            <SlidersHorizontal className="size-4" />
            Variables
          </TabsTrigger>
          <TabsTrigger value="preferencias">
            <Globe className="size-4" />
            Preferencias
          </TabsTrigger>
        </TabsList>

        {/* Perfil */}
        <TabsContent value="personal" className="mt-4">
          <div className="columns-1 gap-6 xl:columns-2">
            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">Datos personales</CardTitle>
                <CardDescription>
                  Información básica visible para el resto del equipo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nombre completo</Label>
                    <Input
                      value={form.full_name}
                      onChange={(e) =>
                        actualizarPersonal({ full_name: e.target.value })
                      }
                      onBlur={() => {
                        setNombreTocado(true);
                        autoguardadoPersonal.guardarYa();
                      }}
                      aria-invalid={nombreTocado && nombreInvalido}
                      placeholder="Caroline Salas"
                    />
                    {nombreTocado && nombreInvalido && (
                      <p className="text-destructive text-xs">
                        El nombre es obligatorio
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={email} disabled />
                    <p className="text-muted-foreground text-xs">
                      Gestionado por tu cuenta de acceso
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Puesto / Cargo</Label>
                    <Input
                      value={form.position}
                      onChange={(e) =>
                        actualizarPersonal({ position: e.target.value })
                      }
                      onBlur={() => autoguardadoPersonal.guardarYa()}
                      placeholder="Diseñadora"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) =>
                        actualizarPersonal({ phone: e.target.value })
                      }
                      onBlur={() => autoguardadoPersonal.guardarYa()}
                      placeholder="+34 600 000 000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha de nacimiento</Label>
                    <Input
                      type="date"
                      value={form.birth_date}
                      onChange={(e) =>
                        actualizarPersonal({ birth_date: e.target.value })
                      }
                      onBlur={() => autoguardadoPersonal.guardarYa()}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">Residencia</CardTitle>
                <CardDescription>Lugar donde vives</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <Input
                    value={form.address}
                    onChange={(e) =>
                      actualizarPersonal({ address: e.target.value })
                    }
                    onBlur={() => autoguardadoPersonal.guardarYa()}
                    placeholder="Calle, número, ciudad, código postal"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">Teléfonos alternos</CardTitle>
                <CardDescription>Otros números de contacto</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {form.alternate_phones.map((phone, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input
                      value={phone}
                      onChange={(e) => {
                        const next = [...form.alternate_phones];
                        next[idx] = e.target.value;
                        setForm({ ...form, alternate_phones: next });
                        autoguardadoPersonal.marcarSucio();
                      }}
                      onBlur={() => autoguardadoPersonal.guardarYa()}
                      placeholder="+34 600 000 000"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive"
                      onClick={() => {
                        const next = form.alternate_phones.filter(
                          (_, i) => i !== idx,
                        );
                        setForm({
                          ...form,
                          alternate_phones: next.length > 0 ? next : [""],
                        });
                        autoguardadoPersonal.marcarSucio();
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForm({
                      ...form,
                      alternate_phones: [...form.alternate_phones, ""],
                    });
                    autoguardadoPersonal.marcarSucio();
                  }}
                >
                  <Plus className="size-4" />
                  Agregar teléfono
                </Button>
              </CardContent>
            </Card>

            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">
                  Contactos de emergencia
                </CardTitle>
                <CardDescription>
                  Personas a contactar en caso de emergencia
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {form.emergency_contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"
                  >
                    <Input
                      value={contact.name}
                      onChange={(e) => {
                        const next = [...form.emergency_contacts];
                        next[idx] = { ...contact, name: e.target.value };
                        setForm({ ...form, emergency_contacts: next });
                        autoguardadoPersonal.marcarSucio();
                      }}
                      onBlur={() => autoguardadoPersonal.guardarYa()}
                      placeholder="Nombre"
                    />
                    <Input
                      value={contact.phone}
                      onChange={(e) => {
                        const next = [...form.emergency_contacts];
                        next[idx] = { ...contact, phone: e.target.value };
                        setForm({ ...form, emergency_contacts: next });
                        autoguardadoPersonal.marcarSucio();
                      }}
                      onBlur={() => autoguardadoPersonal.guardarYa()}
                      placeholder="Teléfono"
                    />
                    <Input
                      value={contact.relationship}
                      onChange={(e) => {
                        const next = [...form.emergency_contacts];
                        next[idx] = {
                          ...contact,
                          relationship: e.target.value,
                        };
                        setForm({ ...form, emergency_contacts: next });
                        autoguardadoPersonal.marcarSucio();
                      }}
                      onBlur={() => autoguardadoPersonal.guardarYa()}
                      placeholder="Parentesco / Relación"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive"
                      onClick={() => {
                        setForm({
                          ...form,
                          emergency_contacts: form.emergency_contacts.filter(
                            (_, i) => i !== idx,
                          ),
                        });
                        autoguardadoPersonal.marcarSucio();
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForm({
                      ...form,
                      emergency_contacts: [
                        ...form.emergency_contacts,
                        { name: "", phone: "", relationship: "" },
                      ],
                    });
                    autoguardadoPersonal.marcarSucio();
                  }}
                >
                  <Plus className="size-4" />
                  Agregar contacto
                </Button>
              </CardContent>
            </Card>

            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">Bio</CardTitle>
                <CardDescription>Cuéntanos un poco sobre ti</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={form.bio}
                  onChange={(e) =>
                    actualizarPersonal({ bio: e.target.value })
                  }
                  onBlur={() => autoguardadoPersonal.guardarYa()}
                  placeholder="Cuéntanos un poco sobre ti..."
                  rows={4}
                />
              </CardContent>
            </Card>

          </div>
          <BarraEstadoGuardado
            estado={autoguardadoPersonal.estado}
            onReintentar={autoguardadoPersonal.reintentar}
            mensajeError="No se pudo guardar el perfil"
          />
        </TabsContent>

        {/* Variables */}
        <TabsContent value="variables" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variables de trabajo</CardTitle>
              <CardDescription>
                Límites horarios y notificaciones de Telegram personales
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Horas diarias</Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={form.daily_hours}
                    disabled={hoursLocked()}
                    onChange={(e) =>
                      actualizarHoras({ daily_hours: Number(e.target.value) })
                    }
                    onBlur={() => autoguardadoVariables.guardarYa()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Horas semanales</Label>
                  <Input
                    type="number"
                    min={1}
                    max={168}
                    value={form.weekly_hours}
                    disabled={hoursLocked()}
                    onChange={(e) =>
                      actualizarHoras({ weekly_hours: Number(e.target.value) })
                    }
                    onBlur={() => autoguardadoVariables.guardarYa()}
                  />
                </div>
                {horasInvalidas && !hoursLocked() && (
                  <p className="text-destructive text-xs sm:col-span-2">
                    Las horas deben estar entre 1 y 24 (día) y 1 y 168
                    (semana). No se guardará hasta corregirlo.
                  </p>
                )}
              </div>
              <div className="space-y-4">
                {hoursLocked() && (
                  <p className="bg-amber-500/10 text-amber-400 text-xs rounded-md p-2">
                    Tienes un horario asignado por la organización: tus límites
                    horarios los administra el equipo directivo.
                  </p>
                )}
                <Separator className="lg:hidden" />
                <p className="text-muted-foreground text-sm">
                  {hoursLocked() ? (
                    <>
                      Tu horario deriva de los turnos que la organización te
                      asignó en{" "}
                      <span className="font-medium text-foreground">
                        Colaboradores
                      </span>
                      .
                    </>
                  ) : (
                    <>
                      La organización también define límites globales en{" "}
                      <span className="font-medium text-foreground">
                        Configuración
                      </span>
                      . Estas variables se usan para cálculos personales de
                      horarios.
                    </>
                  )}
                </p>
                {orgLimits && (
                  <p className="text-muted-foreground text-sm">
                    Límites globales: {orgLimits.daily_hours} h/día ·{" "}
                    {orgLimits.weekly_hours} h/semana
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <BarraEstadoGuardado
            estado={autoguardadoVariables.estado}
            onReintentar={autoguardadoVariables.reintentar}
            mensajeError="No se pudieron guardar las variables"
          />
        </TabsContent>

        {/* Preferencias */}
        <TabsContent value="preferencias" className="mt-4">
          <div className="columns-1 gap-6 lg:columns-2 xl:columns-3">
            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">Apariencia</CardTitle>
                <CardDescription>
                  Cómo se ve la plataforma para ti
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tema</Label>
                    <Select
                      value={prefs.theme}
                      onValueChange={(v) => {
                        const theme = v as ThemePreference;
                        actualizarPrefs({ ...prefs, theme });
                        aplicarTema(theme);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Oscuro</SelectItem>
                        <SelectItem value="light">Claro</SelectItem>
                        <SelectItem value="system">Sistema</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Densidad</Label>
                    <Select
                      value={prefs.density}
                      onValueChange={(v) =>
                        actualizarPrefs({
                          ...prefs,
                          density: v as "normal" | "compact",
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="compact">Compacta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">Fechas y horas</CardTitle>
                <CardDescription>
                  Cómo se muestran y se calculan fechas y horarios
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Formato de hora</Label>
                    <Select
                      value={prefs.time_format}
                      onValueChange={(v) =>
                        actualizarPrefs({
                          ...prefs,
                          time_format: v as "12h" | "24h",
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24h">24 horas (14:30)</SelectItem>
                        <SelectItem value="12h">12 horas (2:30 PM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Primer día de la semana</Label>
                    <Select
                      value={prefs.week_start}
                      onValueChange={(v) =>
                        actualizarPrefs({
                          ...prefs,
                          week_start: v as "monday" | "sunday",
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monday">Lunes</SelectItem>
                        <SelectItem value="sunday">Domingo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Inicio de jornada</Label>
                    <Input
                      type="time"
                      value={prefs.workday_start}
                      onChange={(e) =>
                        actualizarPrefs({ ...prefs, workday_start: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Días laborales</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const next = prefs.work_days.includes(idx)
                            ? prefs.work_days.filter((d) => d !== idx)
                            : [...prefs.work_days, idx].sort();
                          actualizarPrefs({ ...prefs, work_days: next });
                        }}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm transition-colors",
                          prefs.work_days.includes(idx)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Si no hay días marcados, se usan los días laborables por
                    defecto
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">Notificaciones</CardTitle>
                <CardDescription>Qué avisos quieres recibir</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <PrefCheckbox
                  id="notif-task_assigned"
                  label="Tareas asignadas"
                  description="Cuando te asignen una nueva tarea"
                  checked={prefs.notif.task_assigned}
                  onChange={(c) =>
                    actualizarPrefs({
                      ...prefs,
                      notif: { ...prefs.notif, task_assigned: c },
                    })
                  }
                />
                <PrefCheckbox
                  id="notif-task_status"
                  label="Cambios de estado"
                  description="Cuando una tarea cambie de estado"
                  checked={prefs.notif.task_status}
                  onChange={(c) =>
                    actualizarPrefs({
                      ...prefs,
                      notif: { ...prefs.notif, task_status: c },
                    })
                  }
                />
                <PrefCheckbox
                  id="notif-note_added"
                  label="Nuevas notas"
                  description="Cuando se agregue una nota a una tarea"
                  checked={prefs.notif.note_added}
                  onChange={(c) =>
                    actualizarPrefs({
                      ...prefs,
                      notif: { ...prefs.notif, note_added: c },
                    })
                  }
                />
                <PrefCheckbox
                  id="notif-permission"
                  label="Permisos"
                  description="Solicitudes y cambios de permisos"
                  checked={prefs.notif.permission}
                  onChange={(c) =>
                    actualizarPrefs({
                      ...prefs,
                      notif: { ...prefs.notif, permission: c },
                    })
                  }
                />
                <div className="space-y-2 pt-1">
                  <Label>Recordatorio de vencimiento</Label>
                  <Select
                    value={prefs.reminder_before}
                    onValueChange={(v) =>
                      actualizarPrefs({
                        ...prefs,
                        reminder_before:
                          v as ProfilePreferences["reminder_before"],
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin recordatorio</SelectItem>
                      <SelectItem value="30m">30 minutos antes</SelectItem>
                      <SelectItem value="1h">1 hora antes</SelectItem>
                      <SelectItem value="1d">1 día antes</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Se aplicará cuando las notificaciones estén disponibles
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">General</CardTitle>
                <CardDescription>
                  Comportamiento de la plataforma
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label>Vista por defecto al entrar</Label>
                <Select
                  value={prefs.default_view}
                  onValueChange={(v) =>
                    actualizarPrefs({
                      ...prefs,
                      default_view: v as ProfilePreferences["default_view"],
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="calendario">Calendario</SelectItem>
                    <SelectItem value="proyectos">Proyectos</SelectItem>
                    <SelectItem value="pipeline">Pipeline</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card className="mb-6 break-inside-avoid">
              <CardHeader>
                <CardTitle className="text-base">Accesibilidad</CardTitle>
                <CardDescription>
                  Ajustes para una mejor experiencia
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <PrefCheckbox
                  id="a11y-high-contrast"
                  label="Alto contraste"
                  description="Refuerza el contraste de colores"
                  checked={prefs.high_contrast}
                  onChange={(c) => actualizarPrefs({ ...prefs, high_contrast: c })}
                />
                <PrefCheckbox
                  id="a11y-reduce-motion"
                  label="Reducir movimiento"
                  description="Minimiza animaciones y transiciones"
                  checked={prefs.reduce_motion}
                  onChange={(c) => actualizarPrefs({ ...prefs, reduce_motion: c })}
                />
              </CardContent>
            </Card>

          </div>
          <BarraEstadoGuardado
            estado={autoguardadoPreferencias.estado}
            onReintentar={autoguardadoPreferencias.reintentar}
            mensajeError="No se pudieron guardar las preferencias"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

