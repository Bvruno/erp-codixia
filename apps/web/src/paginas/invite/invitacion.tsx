'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getInvitation, acceptInvitation, rejectInvitation } from '@/lib/auth/actions';
import { sesionActual } from '@/lib/auth/sesion';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, ShieldCheck, Lock, PenLine, Layers } from 'lucide-react';
import type { Invitation } from '@/types';

const ENTITY_LABELS: Record<string, string> = {
  workspace: 'área de trabajo',
  folder: 'carpeta',
  list: 'lista de tareas',
  document: 'documento',
  mindmap: 'mapa mental',
};

const PERMISSION_LABELS: Record<string, string> = {
  read: 'Solo lectura',
  write: 'Lectura y escritura',
  manage: 'Gestión completa',
};

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [scopeName, setScopeName] = useState<string | null>(null);
  const [user, setUser] = useState<{ email?: string; id?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const result = await getInvitation(token);

      if (result.error || !result.data) {
        setError(result.error || 'Invitación no encontrada');
        setLoading(false);
        return;
      }

      const invite = result.data as Invitation;

      if (invite.status !== 'pending') {
        setError(
          `Esta invitación ya fue ${
            invite.status === 'accepted'
              ? 'aceptada'
              : invite.status === 'rejected'
                ? 'rechazada'
                : invite.status === 'expired'
                  ? 'expirada'
                  : 'cancelada'
          }`
        );
        setLoading(false);
        return;
      }

      if (new Date(invite.expires_at) < new Date()) {
        setError('Esta invitación ha expirado');
        setLoading(false);
        return;
      }

      setInvitation(invite);
      setOrganizationName(result.organizationName ?? null);
      setScopeName(result.scopeName ?? null);
      setLoading(false);
    }
    load();

    void sesionActual().then((sesion) =>
      setUser(sesion ? { email: sesion.email, id: sesion.userId } : null)
    );
  }, [token]);

  const handleAccept = async () => {
    setProcessing(true);
    setActionError(null);

    const result = await acceptInvitation(token);

    if (result?.error) {
      setActionError(result.error);
      setProcessing(false);
      return;
    }

    if (result?.redirect) {
      router.push(result.redirect);
      return;
    }

    setProcessing(false);
  };

  const handleReject = async () => {
    setProcessing(true);
    const result = await rejectInvitation(token);
    if (result?.redirect) {
      router.push(result.redirect);
      return;
    }
    setProcessing(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="animate-spin size-8 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <Card className="max-w-sm w-full">
          <CardHeader>
            <CardTitle className="text-center">Invitación no válida</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground text-sm">{error}</p>
            <Button onClick={() => router.push('/login')} variant="outline" className="w-full">
              Ir al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasScope = !!invitation?.entity_type && !!invitation?.entity_id;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="max-w-sm w-full">
        <CardHeader>
          <CardTitle className="text-center">Invitación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm text-center">
            Has sido invitado a unirte a{' '}
            <span className="font-medium text-foreground">
              {organizationName || 'una organización'}
            </span>{' '}
            como{' '}
            <span className="font-medium text-foreground">
              {invitation?.role === 'admin' ? 'Administrador' : 'Colaborador'}
            </span>
          </p>

          {hasScope && (
            <div className="bg-muted rounded-md p-3 space-y-2">
              <p className="text-muted-foreground text-xs uppercase">Acceso asignado</p>
              <p className="text-sm flex items-center gap-2">
                {invitation?.permission === 'manage' ? (
                  <ShieldCheck className="size-4 text-primary" />
                ) : invitation?.permission === 'write' ? (
                  <PenLine className="size-4 text-primary" />
                ) : (
                  <Lock className="size-4 text-primary" />
                )}
                <span className="font-medium">
                  {PERMISSION_LABELS[invitation?.permission || 'read']}
                </span>
              </p>
              <p className="text-sm flex items-center gap-2">
                <Layers className="size-4 text-muted-foreground" />
                <span>
                  {ENTITY_LABELS[invitation?.entity_type || 'workspace']}:
                  <span className="font-medium"> {scopeName || 'restringida'}</span>
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {invitation?.inherit
                  ? 'Se hereda al contenido interno'
                  : 'Solo esta entidad, sin contenido interno'}
              </p>
            </div>
          )}

          {!invitation?.entity_type && invitation?.role !== 'admin' && (
            <p className="text-muted-foreground text-xs text-center">
              Acceso general a la organización según visibilidad de cada área
            </p>
          )}

          {actionError && (
            <p role="alert" className="text-destructive text-sm rounded-md bg-destructive/10 p-2">
              {actionError}
            </p>
          )}

          {!user ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                Debes iniciar sesión o crear una cuenta para aceptar
              </p>
              <Button
                onClick={() => router.push(`/login?invite=${token}`)}
                className="w-full"
              >
                Iniciar Sesión
              </Button>
              <Button
                onClick={() => router.push(`/signup?invite=${token}`)}
                variant="outline"
                className="w-full"
              >
                Crear Cuenta
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                Conectado como <span className="font-medium">{user.email}</span>
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleAccept}
                  className="flex-1"
                  disabled={processing}
                >
                  <CheckCircle className="size-4" />
                  Aceptar
                </Button>
                <Button
                  onClick={handleReject}
                  variant="outline"
                  className="flex-1"
                  disabled={processing}
                >
                  <XCircle className="size-4" />
                  Rechazar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
