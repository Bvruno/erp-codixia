'use client';

import { useState } from 'react';
import { api } from '@/lib/api/cliente';
import { useFormatoHora } from '@/lib/use-formato-hora';
import {
  Ban,
  Briefcase,
  Cake,
  CalendarDays,
  Crown,
  Lock,
  Mail,
  MapPin,
  Phone,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScheduleEditor } from '@/components/schedules/schedule-editor';
import { DAY_SHORT_LABELS, weeklyHoursFromSchedules } from '@/lib/schedules';
import type { EntityPermission, Profile, Schedule, Shift } from '@/types';

const PERMISSION_LABELS: Record<EntityPermission, string> = {
  read: 'Solo lectura',
  write: 'Lectura y escritura',
  manage: 'Gestión completa',
};

export interface OrgLimits {
  daily_hours: number;
  weekly_hours: number;
}

export interface GrantSummary {
  typeLabel: string;
  name: string;
  path: string;
  permission: EntityPermission;
  inherit: boolean;
}

interface Props {
  member: Profile;
  isOwner: boolean;
  isSelf: boolean;
  canManage: boolean;
  canAssignAdmin: boolean;
  orgId: string;
  createdBy: string;
  ownerId: string;
  schedules: Schedule[];
  shifts: Shift[];
  grants: GrantSummary[];
  grantsLoading: boolean;
  orgLimits: OrgLimits | null;
  onScheduleChange: () => void | Promise<void>;
  onProfileChanged: () => void | Promise<void>;
  onRoleChange: (role: 'admin' | 'collaborator') => void | Promise<void>;
  onManageAccess: () => void;
  onBlockRequest: () => void;
  onDeleteRequest: () => void;
  onClose: () => void;
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
        <p className="text-sm break-words">{value}</p>
      </div>
    </div>
  );
}

export function MemberDetailCard({
  member,
  isOwner,
  isSelf,
  canManage,
  canAssignAdmin,
  orgId,
  createdBy,
  ownerId,
  schedules,
  shifts,
  grants,
  grantsLoading,
  orgLimits,
  onScheduleChange,
  onProfileChanged,
  onRoleChange,
  onManageAccess,
  onBlockRequest,
  onDeleteRequest,
  onClose,
}: Props) {
  const [draftDaily, setDraftDaily] = useState(member.daily_hours);
  const [draftWeekly, setDraftWeekly] = useState(member.weekly_hours);
  const [savingHours, setSavingHours] = useState(false);
  const { formatHora } = useFormatoHora();

  const initials =
    member.full_name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '--';

  const userSchedules = schedules.filter((s) => s.user_id === member.id);
  const weeklyRealHours = weeklyHoursFromSchedules(schedules, member.id);
  const roleLabel = member.role === 'admin' ? 'Admin' : 'Colaborador';
  const hoursDirty = draftDaily !== member.daily_hours || draftWeekly !== member.weekly_hours;

  const hasContact =
    member.email || member.phone || member.address || member.birth_date || member.telegram_chat_id ||
    (member.alternate_phones?.length ?? 0) > 0;
  const hasProfileInfo = member.position || member.bio;
  const emergencies = member.emergency_contacts ?? [];

  const saveHours = async () => {
    if (draftDaily < 1 || draftDaily > 24) {
      toast.error('Las horas diarias deben estar entre 1 y 24');
      return;
    }
    if (draftWeekly < 1 || draftWeekly > 168) {
      toast.error('Las horas semanales deben estar entre 1 y 168');
      return;
    }
    setSavingHours(true);
    try {
      await api.patch(`/miembros/${member.id}`, {
        daily_hours: draftDaily,
        weekly_hours: draftWeekly,
      });
      toast.success('Horas actualizadas');
      await onProfileChanged();
    } catch {
      toast.error('Error al guardar las horas');
    } finally {
      setSavingHours(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">Detalle del colaborador</CardTitle>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose} title="Quitar selección">
            <X className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar className="size-14">
            <AvatarFallback className="text-base">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold text-lg">{member.full_name}</p>
              {member.position && (
                <span className="text-muted-foreground text-xs truncate max-w-full">{member.position}</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {!canManage && (
                <Badge variant="outline" className="text-xs">
                  <ShieldCheck className="size-3" />
                  {roleLabel}
                </Badge>
              )}
              {isOwner && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Crown className="size-3 text-yellow-500" />
                  Dueño
                </Badge>
              )}
              {isSelf && (
                <Badge variant="outline" className="text-xs gap-1">
                  <UserCheck className="size-3" />
                  Tú
                </Badge>
              )}
              {member.blocked ? (
                <Badge variant="destructive" className="text-xs">
                  Bloqueado
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-success/20 text-success text-xs">
                  Activo
                </Badge>
              )}
              {member.access_mode === 'grants_only' && (
                <Badge variant="outline" className="text-xs gap-1 text-warning" title="Invitado por link con acceso aislado: solo ve los archivos con permiso asignado">
                  <Lock className="size-3" />
                  Acceso restringido
                </Badge>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex flex-col items-end gap-1">
              <Select
                value={member.role}
                onValueChange={(v) => onRoleChange(v as 'admin' | 'collaborator')}
              >
                <SelectTrigger className="h-8 w-36">
                  <ShieldCheck className="text-muted-foreground size-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canAssignAdmin && <SelectItem value="admin">Admin</SelectItem>}
                  <SelectItem value="collaborator">Colaborador</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">Rol</p>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-5">
            {hasContact && (
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Contacto</p>
                <div className="mt-2 space-y-2.5">
                  {member.email && <InfoRow icon={Mail} label="Email" value={member.email} />}
                  {member.phone && <InfoRow icon={Phone} label="Teléfono" value={member.phone} />}
                  {(member.alternate_phones?.length ?? 0) > 0 && (
                    <InfoRow icon={Phone} label="Teléfonos alternativos" value={member.alternate_phones!.join(' · ')} />
                  )}
                  {member.telegram_chat_id && (
                    <InfoRow icon={Send} label="Telegram" value={member.telegram_chat_id} />
                  )}
                  {member.address && <InfoRow icon={MapPin} label="Dirección" value={member.address} />}
                  {member.birth_date && (
                    <InfoRow icon={Cake} label="Nacimiento" value={format(new Date(member.birth_date), 'dd/MM/yyyy')} />
                  )}
                </div>
              </div>
            )}

            {hasProfileInfo && (
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Perfil</p>
                <div className="mt-2 space-y-2.5">
                  {member.position && <InfoRow icon={Briefcase} label="Cargo" value={member.position} />}
                  {member.bio && <InfoRow icon={Users} label="Bio" value={member.bio} />}
                </div>
              </div>
            )}

            {emergencies.length > 0 && (
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Contactos de emergencia
                </p>
                <div className="mt-2 space-y-2">
                  {emergencies.map((c, i) => (
                    <div key={i} className="rounded-md border p-2">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {c.relationship}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="text-muted-foreground size-4" />
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Carga horaria</p>
                </div>
                {canManage && !isOwner && (
                  <ScheduleEditor
                    user={member}
                    schedules={schedules}
                    shifts={shifts}
                    orgId={orgId}
                    createdBy={createdBy}
                    ownerId={ownerId}
                    onChange={onScheduleChange}
                  />
                )}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="bg-muted/40 rounded-md p-2">
                  <p className="text-muted-foreground text-xs text-center">Diarias</p>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={draftDaily}
                      onChange={(e) => setDraftDaily(Number(e.target.value))}
                      disabled={!canManage}
                      aria-label="Horas diarias"
                      className="h-7 w-14 px-1 text-center font-semibold"
                    />
                    <span className="text-muted-foreground text-xs">h</span>
                  </div>
                </div>
                <div className="bg-muted/40 rounded-md p-2">
                  <p className="text-muted-foreground text-xs text-center">Semana objetivo</p>
                  <div className="mt-1 flex items-center justify-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={draftWeekly}
                      onChange={(e) => setDraftWeekly(Number(e.target.value))}
                      disabled={!canManage}
                      aria-label="Horas semanales"
                      className="h-7 w-14 px-1 text-center font-semibold"
                    />
                    <span className="text-muted-foreground text-xs">h</span>
                  </div>
                </div>
                <div className="bg-muted/40 rounded-md p-2 text-center">
                  <p className="text-muted-foreground text-xs">Semana real</p>
                  <p className={`mt-1.5 font-semibold text-sm ${userSchedules.length === 0 ? 'text-red-400' : ''}`}>
                    {isOwner ? '—' : `${weeklyRealHours}h`}
                  </p>
                </div>
              </div>

              {(hoursDirty || orgLimits) && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {hoursDirty ? (
                    <Button size="sm" className="h-7 text-xs" onClick={saveHours} disabled={savingHours}>
                      <Save className="size-3.5" />
                      {savingHours ? 'Guardando...' : 'Guardar horas'}
                    </Button>
                  ) : (
                    <span />
                  )}
                  {orgLimits && (
                    <p className="text-muted-foreground text-xs">
                      Límites org: {orgLimits.daily_hours}h/día · {orgLimits.weekly_hours}h/semana
                    </p>
                  )}
                </div>
              )}

              {isOwner ? (
                <p className="text-muted-foreground mt-3 text-xs">
                  El dueño de la organización está exento: no requiere horario.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-7 gap-1">
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const s = userSchedules.find((x) => x.day_of_week === d);
                    return (
                      <div key={d} className="space-y-1" title={s?.shift?.name}>
                        <p className="text-muted-foreground text-center text-xs font-medium uppercase">
                          {DAY_SHORT_LABELS[d].charAt(0)}
                        </p>
                        {s?.shift ? (
                          <div
                            className="rounded border border-l-4 p-1 text-center text-xs font-medium truncate"
                            style={{ borderColor: `${s.shift.color}88`, borderLeftColor: s.shift.color }}
                            title={`${s.shift.name} · ${formatHora(s.shift.start_time)}–${formatHora(s.shift.end_time)}`}
                          >
                            {s.shift.name}
                          </div>
                        ) : (
                          <div className="border-border/60 rounded border border-dashed p-1 text-center">
                            <span className="text-muted-foreground text-xs">—</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="text-muted-foreground size-4" />
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Accesos</p>
                </div>
                {canManage && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onManageAccess}>
                    <Settings2 className="size-3.5" />
                    Administrar
                  </Button>
                )}
              </div>
              {grantsLoading ? (
                <p className="text-muted-foreground mt-2 text-xs">Cargando accesos...</p>
              ) : grants.length === 0 ? (
                <p className="text-muted-foreground mt-2 text-xs">Sin accesos específicos: solo ve lo público de la organización.</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {grants.map((g) => (
                    <div key={`${g.typeLabel}:${g.name}`} className="rounded-md border p-1.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {PERMISSION_LABELS[g.permission]}
                        </Badge>
                        <p className="text-xs font-medium truncate">
                          {g.typeLabel}: {g.name}
                        </p>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs truncate" title={g.path}>
                        {g.path}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-4" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            Miembro desde{' '}
            <span className="font-medium text-foreground">{format(new Date(member.created_at), 'dd/MM/yyyy')}</span>
          </p>
          {canManage && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={onBlockRequest}
                title={member.blocked ? 'Desbloquear usuario' : 'Bloquear usuario'}
              >
                {member.blocked ? (
                  <>
                    <UserCheck className="text-success size-4" />
                    Desbloquear
                  </>
                ) : (
                  <>
                    <Ban className="text-destructive size-4" />
                    Bloquear
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive h-8"
                onClick={onDeleteRequest}
                title="Eliminar miembro"
              >
                <Trash2 className="size-4" />
                Eliminar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}