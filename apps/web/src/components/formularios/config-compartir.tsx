'use client';

import { useEffect, useState } from 'react';
import {
  Ban,
  Copy,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, apiFetch } from '@/lib/api/cliente';
import { construirEnlaceInvitado, construirEnlacePublico } from './utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  AjustesFormulario,
  EstadoFormulario,
  FormularioInvitado,
  FormularioLista,
  ModoAccesoFormulario,
  TipoIdentificadorFormulario,
} from '@/types';

// Configuración del enlace externo: quién puede responder (público,
// listas blancas/negras por DNI/correo, links personales), consentimiento
// y ciclo de vida (publicar/cerrar/rotar).

type FormularioResumen = {
  id: string;
  nombre: string;
  estado: EstadoFormulario;
  ajustes: AjustesFormulario;
};

export function ConfigCompartirDialog({
  open,
  onOpenChange,
  formulario,
  onAjustes,
  onEstadoCambio,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formulario: FormularioResumen;
  onAjustes: (a: AjustesFormulario) => void;
  onEstadoCambio: (e: EstadoFormulario) => void;
}) {
  const [codigoPublico, setCodigoPublico] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [listas, setListas] = useState<FormularioLista[]>([]);
  const [invitados, setInvitados] = useState<FormularioInvitado[]>([]);
  const [nuevosLinks, setNuevosLinks] = useState<{ nombre: string; codigo: string }[]>([]);
  const [nuevaEntrada, setNuevaEntrada] = useState<{ tipo: TipoIdentificadorFormulario; valor: string }>({
    tipo: 'email',
    valor: '',
  });
  const [nuevoInvitado, setNuevoInvitado] = useState<{ nombre: string; tipo: TipoIdentificadorFormulario | 'ninguno'; valor: string }>(
    { nombre: '', tipo: 'ninguno', valor: '' }
  );

  const { id, nombre, ajustes, estado } = formulario;

  useEffect(() => {
    if (!open) return;
    let activo = true;
    void (async () => {
      try {
        const [resListas, resInvitados] = await Promise.all([
          apiFetch<{ listas: FormularioLista[] }>(`/formularios/${id}/listas`),
          apiFetch<{ invitados: FormularioInvitado[] }>(`/formularios/${id}/invitados`),
        ]);
        if (!activo) return;
        setListas(resListas.listas ?? []);
        setInvitados(resInvitados.invitados ?? []);
      } catch {
        if (activo) toast.error('No se pudo cargar la configuración del enlace');
      }
    })();
    return () => {
      activo = false;
    };
  }, [open, id]);

  const guardarAjustes = async (patch: Partial<AjustesFormulario>) => {
    const siguientes = { ...ajustes, ...patch };
    onAjustes(siguientes);
    try {
      await api.put(`/formularios/${id}`, { ajustes: siguientes });
    } catch {
      toast.error('No se pudieron guardar los ajustes');
    }
  };

  const base = typeof window !== 'undefined' ? window.location.origin : '';

  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar el link');
    }
  };

  const publicar = async () => {
    setBusy('publicar');
    try {
      const res = await api.post<{ token: string; codigo: string }>(
        `/formularios/${id}/publicar`
      );
      setCodigoPublico(res.codigo);
      onEstadoCambio('publicado');
      await copiar(construirEnlacePublico(base, nombre, res.codigo));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo publicar');
    } finally {
      setBusy(null);
    }
  };

  const cerrar = async () => {
    setBusy('cerrar');
    try {
      await api.post(`/formularios/${id}/cerrar`);
      onEstadoCambio('cerrado');
      toast.success('Formulario cerrado: ya no acepta respuestas');
    } catch {
      toast.error('No se pudo cerrar el formulario');
    } finally {
      setBusy(null);
    }
  };

  const rotar = async () => {
    setBusy('rotar');
    try {
      const res = await api.post<{ token: string; codigo: string }>(
        `/formularios/${id}/token/rotar`
      );
      setCodigoPublico(res.codigo);
      if (estado !== 'publicado') onEstadoCambio('publicado');
      await copiar(construirEnlacePublico(base, nombre, res.codigo));
    } catch {
      toast.error('No se pudo rotar el enlace');
    } finally {
      setBusy(null);
    }
  };

  const agregarLista = async () => {
    if (!nuevaEntrada.valor.trim()) return;
    setBusy('lista');
    try {
      await api.post(`/formularios/${id}/listas`, { entradas: [nuevaEntrada] });
      const res = await apiFetch<{ listas: FormularioLista[] }>(`/formularios/${id}/listas`);
      setListas(res.listas ?? []);
      setNuevaEntrada({ ...nuevaEntrada, valor: '' });
    } catch {
      toast.error('No se pudo agregar a la lista');
    } finally {
      setBusy(null);
    }
  };

  const eliminarLista = async (listaId: string) => {
    try {
      await api.delete(`/formularios/${id}/listas/${listaId}`);
      setListas((prev) => prev.filter((l) => l.id !== listaId));
    } catch {
      toast.error('No se pudo quitar de la lista');
    }
  };

  const agregarInvitado = async () => {
    if (!nuevoInvitado.nombre.trim()) return;
    setBusy('invitado');
    try {
      const res = await api.post<{ invitados: { id: string; nombre: string; estado: string; codigo: string }[] }>(
        `/formularios/${id}/invitados`,
        {
          invitados: [
            {
              nombre: nuevoInvitado.nombre.trim(),
              tipo: nuevoInvitado.tipo === 'ninguno' ? null : nuevoInvitado.tipo,
              valor: nuevoInvitado.tipo === 'ninguno' ? null : nuevoInvitado.valor.trim() || null,
            },
          ],
        }
      );
      const creado = res.invitados[0];
      if (creado) setNuevosLinks((prev) => [...prev, { nombre: creado.nombre, codigo: creado.codigo }]);
      const refresco = await apiFetch<{ invitados: FormularioInvitado[] }>(`/formularios/${id}/invitados`);
      setInvitados(refresco.invitados ?? []);
      setNuevoInvitado({ nombre: '', tipo: 'ninguno', valor: '' });
    } catch {
      toast.error('No se pudo crear el invitado');
    } finally {
      setBusy(null);
    }
  };

  const revocar = async (invitadoId: string) => {
    try {
      await api.post(`/formularios/${id}/invitados/${invitadoId}/revocar`);
      setInvitados((prev) =>
        prev.map((i) => (i.id === invitadoId ? { ...i, estado: 'revocado' as const } : i))
      );
    } catch {
      toast.error('No se pudo revocar la invitación');
    }
  };

  const linkGeneral = codigoPublico
    ? construirEnlacePublico(base, nombre, codigoPublico)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            Enlace y acceso
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="enlace">
          <TabsList className="w-full">
            <TabsTrigger value="enlace">Enlace</TabsTrigger>
            <TabsTrigger value="acceso">Acceso</TabsTrigger>
            <TabsTrigger value="invitados">Dirigido</TabsTrigger>
            <TabsTrigger value="privacidad">Privacidad</TabsTrigger>
          </TabsList>

          <TabsContent value="enlace" className="space-y-4 pt-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">
                  Estado:{' '}
                  <span className="capitalize">
                    {estado === 'publicado' ? 'publicado' : estado}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {estado === 'publicado'
                    ? 'Acepta respuestas según la configuración de acceso.'
                    : estado === 'cerrado'
                      ? 'Cerrado: no acepta respuestas nuevas.'
                      : 'Borrador: publica para habilitar el enlace.'}
                </p>
              </div>
              {estado === 'publicado' ? (
                <Button variant="outline" size="sm" onClick={cerrar} disabled={busy !== null}>
                  {busy === 'cerrar' ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                  Cerrar
                </Button>
              ) : (
                <Button size="sm" onClick={publicar} disabled={busy !== null}>
                  {busy === 'publicar' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Publicar
                </Button>
              )}
            </div>

            {linkGeneral ? (
              <div className="space-y-2">
                <Label>Link público</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={linkGeneral} className="text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copiar(linkGeneral)} aria-label="Copiar link">
                    <Copy className="size-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Este link solo se muestra completo al generarlo. Guárdalo o rótalo cuando lo necesites.
                </p>
              </div>
            ) : (
              estado === 'publicado' && (
                <p className="text-xs text-muted-foreground">
                  Por seguridad el link no se vuelve a mostrar. Usa «Rotar enlace» para generar uno nuevo
                  (invalida el anterior).
                </p>
              )
            )}

            {estado === 'publicado' && (
              <Button variant="outline" size="sm" onClick={rotar} disabled={busy !== null}>
                {busy === 'rotar' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Rotar enlace
              </Button>
            )}
          </TabsContent>

          <TabsContent value="acceso" className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label>¿Quién puede responder?</Label>
              <Select
                value={ajustes.modo_acceso}
                onValueChange={(v) => guardarAjustes({ modo_acceso: v as ModoAccesoFormulario })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publico">Público: cualquiera con el link</SelectItem>
                  <SelectItem value="lista">Lista: solo DNI/correo autorizados</SelectItem>
                  <SelectItem value="personal">Dirigido: solo links personales</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ajustes.modo_acceso === 'lista' && (
              <>
                <div className="space-y-2">
                  <Label>Tipo de lista</Label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={ajustes.lista_modo === 'blanca'}
                        onCheckedChange={() => guardarAjustes({ lista_modo: 'blanca' })}
                      />
                      Lista blanca (solo los listados)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={ajustes.lista_modo === 'negra'}
                        onCheckedChange={() => guardarAjustes({ lista_modo: 'negra' })}
                      />
                      Lista negra (todos menos los listados)
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Identificadores aceptados</Label>
                  <div className="flex gap-4 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={ajustes.identificadores.includes('dni')}
                        onCheckedChange={(v) => {
                          const set = new Set(ajustes.identificadores);
                          if (v === true) set.add('dni');
                          else set.delete('dni');
                          if (set.size > 0) guardarAjustes({ identificadores: [...set] });
                        }}
                      />
                      DNI
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={ajustes.identificadores.includes('email')}
                        onCheckedChange={(v) => {
                          const set = new Set(ajustes.identificadores);
                          if (v === true) set.add('email');
                          else set.delete('email');
                          if (set.size > 0) guardarAjustes({ identificadores: [...set] });
                        }}
                      />
                      Correo
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Agregar a la lista</Label>
                  <div className="flex items-end gap-2">
                    <Select
                      value={nuevaEntrada.tipo}
                      onValueChange={(v) =>
                        setNuevaEntrada({ ...nuevaEntrada, tipo: v as TipoIdentificadorFormulario })
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Correo</SelectItem>
                        <SelectItem value="dni">DNI</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={nuevaEntrada.valor}
                      onChange={(e) => setNuevaEntrada({ ...nuevaEntrada, valor: e.target.value })}
                      placeholder={nuevaEntrada.tipo === 'email' ? 'cliente@correo.com' : '12345678'}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void agregarLista();
                      }}
                    />
                    <Button onClick={agregarLista} disabled={busy !== null || !nuevaEntrada.valor.trim()}>
                      Agregar
                    </Button>
                  </div>
                </div>

                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {listas.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">La lista está vacía.</p>
                  ) : (
                    listas.map((l) => (
                      <div key={l.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/50">
                        <span className="flex items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs uppercase text-muted-foreground">
                            {l.tipo}
                          </span>
                          {l.valor}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => eliminarLista(l.id)}
                          aria-label={`Quitar ${l.valor}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={ajustes.una_respuesta_por_persona}
                onCheckedChange={(v) => guardarAjustes({ una_respuesta_por_persona: v === true })}
              />
              Permitir una sola respuesta por persona (cuando se identifica o viene de link personal)
            </label>
          </TabsContent>

          <TabsContent value="invitados" className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">
              Genera links personales para personas específicas. Cada link queda marcado con quién
              respondió y solo acepta una respuesta.
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input
                  value={nuevoInvitado.nombre}
                  onChange={(e) => setNuevoInvitado({ ...nuevoInvitado, nombre: e.target.value })}
                  placeholder="Nombre del cliente"
                />
              </div>
              <div className="w-28 space-y-1">
                <Label className="text-xs">Identifica con</Label>
                <Select
                  value={nuevoInvitado.tipo}
                  onValueChange={(v) =>
                    setNuevoInvitado({ ...nuevoInvitado, tipo: v as TipoIdentificadorFormulario | 'ninguno' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Nada</SelectItem>
                    <SelectItem value="email">Correo</SelectItem>
                    <SelectItem value="dni">DNI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {nuevoInvitado.tipo !== 'ninguno' && (
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Valor</Label>
                  <Input
                    value={nuevoInvitado.valor}
                    onChange={(e) => setNuevoInvitado({ ...nuevoInvitado, valor: e.target.value })}
                    placeholder={nuevoInvitado.tipo === 'email' ? 'cliente@correo.com' : '12345678'}
                  />
                </div>
              )}
              <Button onClick={agregarInvitado} disabled={busy !== null || !nuevoInvitado.nombre.trim()}>
                {busy === 'invitado' ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                Crear link
              </Button>
            </div>

            {nuevosLinks.length > 0 && (
              <div className="space-y-2 rounded-md border border-success/40 bg-success/5 p-3">
                <p className="text-xs font-medium">Links recién creados (cópialos ahora)</p>
                {nuevosLinks.map((l) => {
                  const link = construirEnlaceInvitado(base, nombre, l.codigo);
                  return (
                    <div key={l.codigo} className="flex items-center gap-2">
                      <span className="w-32 truncate text-xs">{l.nombre}</span>
                      <Input readOnly value={link} className="h-8 text-xs" />
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => copiar(link)}
                        aria-label="Copiar link personal"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" onClick={() => setNuevosLinks([])}>
                  <X className="size-3.5" />
                  Ocultar
                </Button>
              </div>
            )}

            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {invitados.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">Aún no hay invitados.</p>
              ) : (
                invitados.map((i) => (
                  <div key={i.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted/50">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{i.nombre}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {i.estado === 'respondido' ? 'Respondió' : i.estado === 'revocado' ? 'Revocado' : 'Pendiente'}
                      </span>
                    </span>
                    {i.estado === 'pendiente' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => revocar(i.id)}
                        aria-label={`Revocar invitación de ${i.nombre}`}
                      >
                        <Ban className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="privacidad" className="space-y-4 pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={ajustes.requiere_consentimiento}
                onCheckedChange={(v) => guardarAjustes({ requiere_consentimiento: v === true })}
              />
              Exigir consentimiento de privacidad antes de enviar
            </label>

            <div className="space-y-2">
              <Label>Aviso de privacidad</Label>
              <Textarea
                value={ajustes.texto_privacidad}
                onChange={(e) => onAjustes({ ...ajustes, texto_privacidad: e.target.value })}
                onBlur={(e) => guardarAjustes({ texto_privacidad: e.target.value })}
                rows={5}
                placeholder="Uso de los datos, finalidad, derechos del titular…"
              />
            </div>

            <div className="space-y-2">
              <Label>Mensaje al confirmar</Label>
              <Input
                value={ajustes.mensaje_confirmacion}
                onChange={(e) => onAjustes({ ...ajustes, mensaje_confirmacion: e.target.value })}
                onBlur={(e) => guardarAjustes({ mensaje_confirmacion: e.target.value })}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
