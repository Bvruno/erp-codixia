import { useState } from 'react';
import {
  Bot,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  Webhook,
} from 'lucide-react';
import {
  renderPlantilla,
  type CategoriaTelegram,
  type EventoTelegram,
} from '@erp/shared/telegram-plataforma';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tabla,
  TablaCabecera,
  TablaCelda,
  TablaCuerpo,
  TablaEncabezado,
  TablaFila,
} from '@/components/ui/tabla';
import { Alerta, Dato, Etiqueta } from '@/components/ui/alerta';
import { Paginacion } from '@/components/paginacion';
import { useDatos } from '@/lib/use-datos';
import {
  activarWebhookTelegram,
  cambiarCategoriaTelegram,
  desactivarWebhookTelegram,
  guardarConfigTelegram,
  guardarEventoTelegram,
  probarBotTelegram,
  probarEnvioTelegram,
  restaurarEventoTelegram,
  sincronizarTelegram,
  type RespuestaConfigTelegram,
} from '@/lib/api/panel';
import { formatearFechaHora, hace } from '@/lib/formato';
import { cn } from '@/lib/utils';

type Seccion = 'configuracion' | 'eventos' | 'historial';

const SECCIONES: { id: Seccion; etiqueta: string }[] = [
  { id: 'configuracion', etiqueta: 'Configuración' },
  { id: 'eventos', etiqueta: 'Eventos y plantillas' },
  { id: 'historial', etiqueta: 'Historial' },
];

export function TelegramPage() {
  const [seccion, setSeccion] = useState<Seccion>('configuracion');
  const config = useDatos<RespuestaConfigTelegram>('/plataforma/telegram/config');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Telegram</h1>
          <p className="text-muted-foreground text-sm">
            Bot único de la plataforma, destino, eventos, reglas y campana del panel.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={config.recargar}>
          <RefreshCw />
          Actualizar
        </Button>
      </div>

      <div className="flex gap-1 border-b">
        {SECCIONES.map(({ id, etiqueta }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSeccion(id)}
            className={cn(
              'text-muted-foreground -mb-px border-b-2 border-transparent px-3 py-2 text-sm transition-colors',
              seccion === id && 'border-primary text-foreground font-medium'
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {config.error && <Alerta>{config.error}</Alerta>}
      {config.cargando && (
        <p className="text-muted-foreground text-sm">Cargando configuración…</p>
      )}

      {seccion === 'configuracion' && config.datos && (
        <FormularioConfig
          key={config.datos.data.updated_at ?? 'nueva'}
          estado={config.datos}
          onRecargar={config.recargar}
        />
      )}
      {seccion === 'eventos' && <EventosTelegram />}
      {seccion === 'historial' && <HistorialEnvios />}
    </div>
  );
}

function FormularioConfig({
  estado,
  onRecargar,
}: {
  estado: RespuestaConfigTelegram;
  onRecargar: () => void;
}) {
  const config = estado.data;
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(config.enabled);
  const [chatDestino, setChatDestino] = useState(config.chat_destino ?? '');
  const [chatEtiqueta, setChatEtiqueta] = useState(config.chat_etiqueta ?? '');
  const [nivelMinimo, setNivelMinimo] = useState(config.nivel_minimo);
  const [agrupar, setAgrupar] = useState(String(config.agrupar_errores_segundos));
  const [rateLimit, setRateLimit] = useState(String(config.rate_limit_hora));
  const [quietActivo, setQuietActivo] = useState(config.quiet_hours.activo);
  const [quietDesde, setQuietDesde] = useState(config.quiet_hours.desde);
  const [quietHasta, setQuietHasta] = useState(config.quiet_hours.hasta);
  const [markdown, setMarkdown] = useState(config.markdown);
  const [digestActivo, setDigestActivo] = useState(config.digest_activo);
  const [digestHora, setDigestHora] = useState(config.digest_hora);
  const [baseUrl, setBaseUrl] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [mostrarToken, setMostrarToken] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState<{
    ok: boolean;
    titulo: string;
    detalle: string | null;
    esGuardado: boolean;
  } | null>(null);

  async function ejecutar(fn: () => Promise<void>) {
    setOcupado(true);
    setAviso(null);
    setErrorAccion(null);
    try {
      await fn();
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo completar la acción');
    } finally {
      setOcupado(false);
    }
  }

  const guardar = () =>
    ejecutar(async () => {
      await guardarConfigTelegram({
        ...(token.trim() ? { bot_token: token.trim() } : {}),
        chat_destino: chatDestino.trim() || null,
        chat_etiqueta: chatEtiqueta.trim() || null,
        enabled,
        nivel_minimo: nivelMinimo,
        agrupar_errores_segundos: Number(agrupar),
        rate_limit_hora: Number(rateLimit),
        quiet_hours: {
          activo: quietActivo,
          desde: quietDesde,
          hasta: quietHasta,
        },
        markdown,
        digest_activo: digestActivo,
        digest_hora: digestHora,
      });
      setToken('');
      setAviso('Configuración guardada');
      onRecargar();
    });

  const probarToken = (escrito: boolean) =>
    ejecutar(async () => {
      setResultadoPrueba(null);
      const res = await probarBotTelegram(escrito ? token.trim() : undefined);
      setResultadoPrueba({
        ok: res.ok,
        titulo: res.ok
          ? `Conexión OK con @${res.bot?.username ?? '?'}`
          : 'Telegram rechazó la consulta',
        detalle: res.ok
          ? `${res.bot?.nombre ?? 'sin nombre'} · id ${res.bot?.id ?? '?'}`
          : res.error,
        esGuardado: res.es_token_guardado,
      });
      if (res.ok && escrito) {
        setAviso('Token válido. Pulsa «Guardar token y cambios» para usarlo.');
      } else if (res.ok) {
        setAviso(null);
      }
    });

  const detectarDestino = () =>
    ejecutar(async () => {
      const res = await sincronizarTelegram();
      setAviso(
        res.vinculado
          ? 'Chat vinculado con el último /start recibido'
          : `Updates procesados: ${res.procesados}`
      );
      onRecargar();
    });

  const probarEnvio = () =>
    ejecutar(async () => {
      await probarEnvioTelegram(chatDestino.trim() || null);
      setAviso('Mensaje de prueba enviado');
      onRecargar();
    });

  return (
    <div className="space-y-4">
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      {errorAccion && <Alerta>{errorAccion}</Alerta>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Conexión del bot</CardTitle>
            <Button variant="ghost" size="sm" onClick={onRecargar} disabled={ocupado}>
              <RefreshCw />
              Recalcular estado
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4',
                estado.bot.consulta_ok
                  ? 'border-emerald-600/40 bg-emerald-600/5'
                  : config.bot_token_mascara
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'bg-muted/40'
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-full',
                    estado.bot.consulta_ok
                      ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400'
                      : config.bot_token_mascara
                        ? 'bg-destructive/15 text-destructive'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Bot className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    {estado.bot.consulta_ok
                      ? 'Conectado'
                      : config.bot_token_mascara
                        ? 'Sin conexión con Telegram'
                        : 'Sin token configurado'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {estado.bot.consulta_ok
                      ? `@${estado.bot.username ?? '?'} · ${estado.bot.nombre ?? 'sin nombre'} · id ${estado.bot.id ?? '?'}`
                      : estado.bot.error ??
                        'Pega el token que te dio @BotFather y pruébalo.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  Token:{' '}
                  {config.token_origen === 'bd'
                    ? 'guardado en BD'
                    : config.token_origen === 'entorno'
                      ? 'variable de entorno'
                      : 'ninguno'}
                </Badge>
                {estado.bot.consulta_ok && (
                  <>
                    <Badge variant={estado.bot.puede_unirse_grupos ? 'exito' : 'secondary'}>
                      {estado.bot.puede_unirse_grupos ? 'Puede unirse a grupos' : 'Sin grupos'}
                    </Badge>
                    <Badge variant={estado.bot.lee_todos_los_grupos ? 'exito' : 'secondary'}>
                      {estado.bot.lee_todos_los_grupos ? 'Lee grupos' : 'No lee grupos'}
                    </Badge>
                    <Badge variant={estado.bot.soporta_inline ? 'exito' : 'secondary'}>
                      {estado.bot.soporta_inline ? 'Inline' : 'Sin inline'}
                    </Badge>
                  </>
                )}
              </div>
            </div>

            {config.token_origen === 'entorno' && (
              <Alerta tipo="info">
                El token activo viene de <code>TELEGRAM_BOT_TOKEN</code>. Para administrarlo
                desde el panel, pégalo abajo y guárdalo.
              </Alerta>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="bot-token">Token del bot</Label>
                  <div className="flex gap-2">
                    <Input
                      id="bot-token"
                      type={mostrarToken ? 'text' : 'password'}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="123456:ABC-DEF…"
                      autoComplete="off"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={mostrarToken ? 'Ocultar token' : 'Mostrar token'}
                      onClick={() => setMostrarToken((v) => !v)}
                    >
                      {mostrarToken ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Actual: {config.bot_token_mascara ?? 'sin token'}. Déjalo vacío para
                    conservar el que ya está guardado.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={guardar} disabled={ocupado}>
                    <Save />
                    Guardar token y cambios
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Etiqueta>Diagnóstico</Etiqueta>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => probarToken(false)} disabled={ocupado}>
                    <ShieldCheck />
                    Probar token activo
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => probarToken(true)}
                    disabled={ocupado || !token.trim()}
                  >
                    <ShieldCheck />
                    Probar token escrito
                  </Button>
                </div>
                {resultadoPrueba && (
                  <Alerta tipo={resultadoPrueba.ok ? 'exito' : 'error'}>
                    <span className="font-medium">{resultadoPrueba.titulo}</span>
                    {resultadoPrueba.detalle && (
                      <span className="block text-xs">{resultadoPrueba.detalle}</span>
                    )}
                    {!resultadoPrueba.esGuardado && resultadoPrueba.ok && (
                      <span className="block text-xs">
                        Este token todavía no es el guardado: pulsa guardar para usarlo.
                      </span>
                    )}
                  </Alerta>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="size-4"
                  />
                  Envío a Telegram activo (la campana del panel sigue activa por evento)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <Dato etiqueta="Envíos 24h">{estado.salud.envios_24h}</Dato>
                  <Dato etiqueta="Fallos 24h">{estado.salud.fallos_24h}</Dato>
                  <Dato etiqueta="Último">
                    {estado.salud.ultimo_envio ? hace(estado.salud.ultimo_envio) : '—'}
                  </Dato>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Destino</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="chat-destino">Chat destino (chat_id)</Label>
                <Input
                  id="chat-destino"
                  value={chatDestino}
                  onChange={(e) => setChatDestino(e.target.value)}
                  placeholder="5344637405"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="chat-etiqueta">Etiqueta</Label>
                <Input
                  id="chat-etiqueta"
                  value={chatEtiqueta}
                  onChange={(e) => setChatEtiqueta(e.target.value)}
                  placeholder="Equipo interno"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Envía <code>/start</code> al bot desde el chat (o grupo) y usa «Detectar con
              /start» para capturar el chat_id automáticamente.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={detectarDestino} disabled={ocupado}>
                <Send />
                Detectar con /start
              </Button>
              <Button variant="outline" onClick={probarEnvio} disabled={ocupado}>
                <Send />
                Enviar prueba
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Webhook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Dato etiqueta="Recepción">
                {estado.webhook.activo ? (
                  <Badge variant="exito">Webhook activo</Badge>
                ) : (
                  <Badge variant="secondary">Polling (cron cada 15 min)</Badge>
                )}
              </Dato>
              <Dato etiqueta="Updates pendientes">{estado.webhook.pendientes}</Dato>
              <Dato etiqueta="Secreto">
                {config.webhook_secret_configurado ? 'Configurado' : 'Aún no generado'}
              </Dato>
            </div>
            {estado.webhook.url && (
              <p className="text-muted-foreground truncate text-xs">{estado.webhook.url}</p>
            )}
            {estado.webhook.consulta_error && (
              <Alerta>No se pudo consultar el webhook: {estado.webhook.consulta_error}</Alerta>
            )}
            {estado.webhook.ultimo_error && (
              <Alerta>
                <TriangleAlert className="mr-1 inline size-3" />
                Telegram reporta: {estado.webhook.ultimo_error}
              </Alerta>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1 space-y-1">
                <Label htmlFor="base-url">URL pública de la API (HTTPS)</Label>
                <Input
                  id="base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.tu-dominio.com"
                />
              </div>
              <Button
                variant="outline"
                disabled={ocupado || !baseUrl.trim()}
                onClick={() =>
                  ejecutar(async () => {
                    await activarWebhookTelegram(baseUrl.trim());
                    setAviso('Webhook activado');
                    onRecargar();
                  })
                }
              >
                <Webhook />
                Activar
              </Button>
              <Button
                variant="ghost"
                disabled={ocupado || !estado.webhook.activo}
                onClick={() =>
                  ejecutar(async () => {
                    await desactivarWebhookTelegram();
                    setAviso('Webhook desactivado; se usará polling');
                    onRecargar();
                  })
                }
              >
                Desactivar
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Con webhook inactivo, el cron de plataforma hace getUpdates cada 15 min. En local
              no hace falta webhook: usa «Detectar con /start».
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reglas de envío</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nivel mínimo de errores</Label>
                <select
                  value={nivelMinimo}
                  onChange={(e) => setNivelMinimo(e.target.value as 'warning' | 'error')}
                  className="border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="warning">Warning y error</option>
                  <option value="error">Solo error</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="agrupar">Agrupar errores (segundos)</Label>
                <Input
                  id="agrupar"
                  type="number"
                  min={0}
                  max={86400}
                  value={agrupar}
                  onChange={(e) => setAgrupar(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rate">Máximo de mensajes por hora</Label>
                <Input
                  id="rate"
                  type="number"
                  min={1}
                  max={1000}
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                />
              </div>
              <label className="flex items-end gap-2 pb-1 text-sm">
                <input
                  type="checkbox"
                  checked={markdown}
                  onChange={(e) => setMarkdown(e.target.checked)}
                  className="size-4"
                />
                Formato Markdown
              </label>
            </div>

            <div className="space-y-2 border-t pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={quietActivo}
                  onChange={(e) => setQuietActivo(e.target.checked)}
                  className="size-4"
                />
                Horario de silencio (los errores críticos siempre pasan)
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="quiet-desde">Desde</Label>
                  <Input
                    id="quiet-desde"
                    type="time"
                    value={quietDesde}
                    onChange={(e) => setQuietDesde(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="quiet-hasta">Hasta</Label>
                  <Input
                    id="quiet-hasta"
                    type="time"
                    value={quietHasta}
                    onChange={(e) => setQuietHasta(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-xs">Horario en hora de Perú (GMT-5).</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen programado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={digestActivo}
                onChange={(e) => setDigestActivo(e.target.checked)}
                className="size-4"
              />
              Enviar resumen diario
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="digest-hora">Hora</Label>
                <Input
                  id="digest-hora"
                  type="time"
                  value={digestHora}
                  onChange={(e) => setDigestHora(e.target.value)}
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">Hora de Perú (GMT-5).</p>
            <Button onClick={guardar} disabled={ocupado}>
              <Save />
              Guardar configuración
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EventosTelegram() {
  const { datos, cargando, error, recargar } = useDatos<{
    data: EventoTelegram[];
    categorias: { id: CategoriaTelegram; etiqueta: string; descripcion: string }[];
  }>('/plataforma/telegram/eventos');
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error && <Alerta>{error}</Alerta>}
      {aviso && <Alerta tipo="info">{aviso}</Alerta>}
      {cargando && <p className="text-muted-foreground text-sm">Cargando eventos…</p>}

      {(datos?.categorias ?? []).map((categoria) => {
        const eventos = (datos?.data ?? []).filter((e) => e.categoria === categoria.id);
        const todosActivos = eventos.every((e) => e.habilitado);
        return (
          <Card key={categoria.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">{categoria.etiqueta}</CardTitle>
                <p className="text-muted-foreground text-xs">{categoria.descripcion}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await cambiarCategoriaTelegram(categoria.id, !todosActivos);
                  setAviso(
                    `${categoria.etiqueta}: ${!todosActivos ? 'activados' : 'desactivados'}`
                  );
                  recargar();
                }}
              >
                {todosActivos ? 'Desactivar todos' : 'Activar todos'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {eventos.map((evento) => (
                <EditorEvento
                  key={`${evento.evento}-${evento.habilitado}-${evento.plantilla}`}
                  evento={evento}
                  onGuardado={(mensaje) => {
                    setAviso(mensaje);
                    recargar();
                  }}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function EditorEvento({
  evento,
  onGuardado,
}: {
  evento: EventoTelegram;
  onGuardado: (mensaje: string) => void;
}) {
  const [habilitado, setHabilitado] = useState(evento.habilitado);
  const [plantilla, setPlantilla] = useState(evento.plantilla);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const preview = renderPlantilla(
    plantilla,
    Object.fromEntries(evento.variables.map((v) => [v, `[${v}]`]))
  );

  async function guardar() {
    setOcupado(true);
    setErrorAccion(null);
    try {
      await guardarEventoTelegram(evento.evento, { habilitado, plantilla });
      onGuardado(`${evento.etiqueta}: guardado`);
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={habilitado}
            onChange={(e) => setHabilitado(e.target.checked)}
            className="size-4"
          />
          <span className="font-medium">{evento.etiqueta}</span>
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Ocultar' : 'Plantilla'}
          </Button>
          <Button variant="outline" size="sm" disabled={ocupado} onClick={guardar}>
            <Save />
            Guardar
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{evento.descripcion}</p>

      {abierto && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`plantilla-${evento.evento}`}>Plantilla</Label>
            <Textarea
              id={`plantilla-${evento.evento}`}
              rows={5}
              value={plantilla}
              onChange={(e) => setPlantilla(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {evento.variables.map((variable) => (
              <button
                key={variable}
                type="button"
                onClick={() => setPlantilla((p) => `${p}{{${variable}}}`)}
                className="bg-muted hover:bg-accent rounded px-2 py-0.5 font-mono text-[11px]"
              >
                {`{{${variable}}}`}
              </button>
            ))}
          </div>
          <div className="bg-muted/50 space-y-1 rounded-md p-3">
            <Etiqueta>Vista previa</Etiqueta>
            <p className="text-sm whitespace-pre-line">{preview.texto || '—'}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              try {
                await restaurarEventoTelegram(evento.evento);
                onGuardado(`${evento.etiqueta}: plantilla restaurada`);
              } catch (e) {
                setErrorAccion(e instanceof Error ? e.message : 'No se pudo restaurar');
              } finally {
                setOcupado(false);
              }
            }}
          >
            <Undo2 />
            Restaurar original
          </Button>
          {errorAccion && <Alerta>{errorAccion}</Alerta>}
        </div>
      )}
    </div>
  );
}

function HistorialEnvios() {
  const [estado, setEstado] = useState<'ok' | 'fallo' | ''>('');
  const [page, setPage] = useState(1);
  const { datos, cargando, error } = useDatos<{
    data: {
      id: number;
      evento: string;
      chat: string | null;
      ok: boolean;
      status_code: number | null;
      error: string | null;
      created_at: string;
    }[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/plataforma/telegram/envios?estado=${estado}&page=${page}`);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Historial de envíos</CardTitle>
        <select
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value as 'ok' | 'fallo' | '');
            setPage(1);
          }}
          className="border-input dark:bg-input/30 h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">Todos</option>
          <option value="ok">Entregados</option>
          <option value="fallo">Fallidos</option>
        </select>
      </CardHeader>
      <CardContent>
        {error && <Alerta>{error}</Alerta>}
        {cargando ? (
          <p className="text-muted-foreground py-6 text-sm">Cargando historial…</p>
        ) : (
          <Tabla>
            <TablaEncabezado>
              <TablaFila>
                <TablaCabecera>Fecha</TablaCabecera>
                <TablaCabecera>Evento</TablaCabecera>
                <TablaCabecera>Estado</TablaCabecera>
                <TablaCabecera>Detalle</TablaCabecera>
              </TablaFila>
            </TablaEncabezado>
            <TablaCuerpo>
              {(datos?.data ?? []).map((envio) => (
                <TablaFila key={envio.id}>
                  <TablaCelda className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatearFechaHora(envio.created_at)}
                  </TablaCelda>
                  <TablaCelda className="font-medium">{envio.evento}</TablaCelda>
                  <TablaCelda>
                    {envio.ok ? (
                      <Badge variant="exito">Entregado</Badge>
                    ) : (
                      <Badge variant="destructive">{envio.status_code ?? 'error'}</Badge>
                    )}
                  </TablaCelda>
                  <TablaCelda className="text-muted-foreground max-w-80 truncate text-xs">
                    {envio.error ?? envio.chat ?? '—'}
                  </TablaCelda>
                </TablaFila>
              ))}
              {(datos?.data ?? []).length === 0 && (
                <TablaFila>
                  <TablaCelda colSpan={4} className="text-muted-foreground py-8 text-center">
                    Sin envíos registrados.
                  </TablaCelda>
                </TablaFila>
              )}
            </TablaCuerpo>
          </Tabla>
        )}
        {datos && (
          <Paginacion
            page={datos.page}
            pageSize={datos.pageSize}
            total={datos.total}
            onCambiar={setPage}
          />
        )}
      </CardContent>
    </Card>
  );
}
