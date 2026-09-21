'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ClipboardList, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch, api } from '@/lib/api/cliente';
import { mensajeAcceso } from '@erp/shared';
import type { MotivoAccesoFormulario } from '@erp/shared';
import { RenderizadorFormulario } from './renderizador-formulario';
import type {
  FormularioPublico,
  RespuestasFormulario,
  TipoIdentificadorFormulario,
} from '@/types';

// Página pública de respuesta (sin sesión). Soporta el enlace general
// (con gate de DNI/correo cuando el modo es lista) y el link personal.

export function ResponderPublico({
  credencial,
  modo,
}: {
  credencial: string;
  modo: 'general' | 'personal';
}) {
  const [cargando, setCargando] = useState(true);
  const [formulario, setFormulario] = useState<FormularioPublico | null>(null);
  const [nombreInvitado, setNombreInvitado] = useState<string | null>(null);
  const [invitadoRespondio, setInvitadoRespondio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identificador, setIdentificador] = useState<{ tipo: TipoIdentificadorFormulario; valor: string } | null>(null);
  const [gateTipo, setGateTipo] = useState<TipoIdentificadorFormulario>('email');
  const [gateValor, setGateValor] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    void (async () => {
      try {
        if (modo === 'personal') {
          const res = await apiFetch<{
            formulario: FormularioPublico;
            invitado: { nombre: string; ya_respondio: boolean };
          }>(`/publico/formularios/invitado/${credencial}`);
          if (!activo) return;
          setFormulario(res.formulario);
          setNombreInvitado(res.invitado.nombre);
          setInvitadoRespondio(res.invitado.ya_respondio);
        } else {
          const res = await apiFetch<{ formulario: FormularioPublico }>(
            `/publico/formularios/${credencial}`
          );
          if (!activo) return;
          setFormulario(res.formulario);
          if (res.formulario.modo_acceso === 'lista') {
            setGateTipo(res.formulario.identificadores[0] ?? 'email');
          }
        }
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : 'Formulario no disponible');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [credencial, modo]);

  const validarIdentidad = async () => {
    if (!gateValor.trim()) return;
    setGateBusy(true);
    setGateError(null);
    try {
      const res = await api.post<{ permitido: boolean; motivo: string; mensaje: string }>(
        `/publico/formularios/${credencial}/identificar`,
        { tipo: gateTipo, valor: gateValor.trim() }
      );
      if (res.permitido) {
        setIdentificador({ tipo: gateTipo, valor: gateValor.trim() });
      } else {
        setGateError(res.mensaje || mensajeAcceso(res.motivo as MotivoAccesoFormulario));
      }
    } catch (e) {
      setGateError(e instanceof Error ? e.message : 'No se pudo validar tu identificación');
    } finally {
      setGateBusy(false);
    }
  };

  const enviar = async (
    respuestas: RespuestasFormulario,
    consentimiento: boolean,
    website: string
  ) => {
    setEnviando(true);
    try {
      const ruta =
        modo === 'personal'
          ? `/publico/formularios/invitado/${credencial}/respuestas`
          : `/publico/formularios/${credencial}/respuestas`;
      const res = await api.post<{ ok: boolean; mensaje: string }>(ruta, {
        respuestas,
        consentimiento,
        website,
        ...(modo === 'general' && identificador ? { identificador } : {}),
      });
      setExito(res.mensaje || formulario?.mensaje_confirmacion || 'Gracias por tu respuesta.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la respuesta');
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Marco>
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <AlertCircle className="size-7 text-destructive" />
          <p className="font-medium">{error}</p>
          <p className="text-sm text-muted-foreground">
            Verifica el enlace o contacta a quien te lo compartió.
          </p>
        </div>
      </Marco>
    );
  }

  if (!formulario) return null;

  if (exito) {
    return (
      <Marco>
        <RenderizadorFormulario modo="real" formulario={formulario} mensajeExito={exito} />
      </Marco>
    );
  }

  if (modo === 'personal' && invitadoRespondio) {
    return (
      <Marco>
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <ClipboardList className="size-7 text-emerald-500" />
          <p className="font-medium">Ya registramos tu respuesta</p>
          <p className="text-sm text-muted-foreground">
            Cada link personal acepta una sola respuesta.
          </p>
        </div>
      </Marco>
    );
  }

  if (modo === 'general' && formulario.modo_acceso === 'personal') {
    return (
      <Marco>
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
          <Lock className="size-7 text-muted-foreground" />
          <p className="font-medium">{mensajeAcceso('requiere_invitacion')}</p>
        </div>
      </Marco>
    );
  }

  const requiereGate = modo === 'general' && formulario.modo_acceso === 'lista' && !identificador;

  return (
    <Marco>
      {requiereGate ? (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <div>
            <h1 className="text-lg font-semibold">{formulario.nombre}</h1>
            {formulario.descripcion && (
              <p className="mt-1 text-sm text-muted-foreground">{formulario.descripcion}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gate-tipo">Identifícate para continuar</Label>
            <div className="flex items-end gap-2">
              <Select
                value={gateTipo}
                onValueChange={(v) => setGateTipo(v as TipoIdentificadorFormulario)}
              >
                <SelectTrigger id="gate-tipo" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formulario.identificadores.includes('email') && (
                    <SelectItem value="email">Correo</SelectItem>
                  )}
                  {formulario.identificadores.includes('dni') && (
                    <SelectItem value="dni">DNI</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Input
                value={gateValor}
                onChange={(e) => setGateValor(e.target.value)}
                placeholder={gateTipo === 'email' ? 'cliente@correo.com' : '12345678'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void validarIdentidad();
                }}
                aria-invalid={gateError ? true : undefined}
              />
              <Button onClick={validarIdentidad} disabled={gateBusy || !gateValor.trim()}>
                {gateBusy ? <Loader2 className="size-4 animate-spin" /> : 'Continuar'}
              </Button>
            </div>
            {gateError && (
              <p role="alert" className="text-sm text-destructive">
                {gateError}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          {identificador && (
            <p className="mb-3 text-right text-xs text-muted-foreground">
              Identificado como <span className="font-medium">{identificador.valor}</span>
            </p>
          )}
          <RenderizadorFormulario
            modo="real"
            formulario={formulario}
            enviando={enviando}
            onEnviar={enviar}
            nombreInvitado={nombreInvitado}
          />
        </>
      )}
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ClipboardList className="size-4" />
          Formulario
        </div>
        {children}
      </div>
    </div>
  );
}
