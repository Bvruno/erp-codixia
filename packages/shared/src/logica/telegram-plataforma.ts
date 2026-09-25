import { z } from 'zod';

// Contrato del Telegram de la plataforma: catálogo de eventos, render de
// plantillas y esquemas de configuración. Solo lo usan la API y el panel
// de plataforma (subpath ./telegram-plataforma).

export const CATEGORIAS_TELEGRAM = [
  { id: 'solicitudes', etiqueta: 'Solicitudes', descripcion: 'Funnel de acceso de owners.' },
  { id: 'empresas', etiqueta: 'Empresas', descripcion: 'Ciclo de vida de cada organización.' },
  { id: 'facturacion', etiqueta: 'Facturación', descripcion: 'Facturas y suscripciones.' },
  { id: 'administracion', etiqueta: 'Administración', descripcion: 'Superadmins de la plataforma.' },
  { id: 'salud', etiqueta: 'Salud del sistema', descripcion: 'Errores y límites de uso.' },
  { id: 'resumen', etiqueta: 'Resumen y avisos', descripcion: 'Digest y avisos programados.' },
] as const;

export type CategoriaTelegram = (typeof CATEGORIAS_TELEGRAM)[number]['id'];

export interface EventoTelegramDef {
  evento: string;
  etiqueta: string;
  descripcion: string;
  categoria: CategoriaTelegram;
  variables: string[];
  plantilla: string;
}

export const EVENTOS_TELEGRAM: EventoTelegramDef[] = [
  {
    evento: 'solicitud_nueva',
    etiqueta: 'Solicitud nueva',
    descripcion: 'Alguien completó el formulario público de acceso.',
    categoria: 'solicitudes',
    variables: ['empresa', 'contacto', 'email', 'pais', 'sector', 'tamano_equipo', 'motivacion'],
    plantilla:
      '📥 Nueva solicitud\nEmpresa: {{empresa}}\nContacto: {{contacto}} ({{email}})\nPaís: {{pais}} · Sector: {{sector}}\nTamaño: {{tamano_equipo}}\nMotivación: {{motivacion}}',
  },
  {
    evento: 'solicitud_en_revision',
    etiqueta: 'Solicitud en revisión',
    descripcion: 'La solicitud pasó a revisión manual.',
    categoria: 'solicitudes',
    variables: ['empresa', 'contacto'],
    plantilla: '🔎 Solicitud en revisión\n{{empresa}} — {{contacto}}',
  },
  {
    evento: 'solicitud_aprobada',
    etiqueta: 'Solicitud aprobada',
    descripcion: 'Se creó la empresa y el link de invitación del owner.',
    categoria: 'solicitudes',
    variables: ['empresa', 'plan', 'enlace_invitacion', 'expira_at'],
    plantilla:
      '✅ Solicitud aprobada\n{{empresa}}\nPlan: {{plan}}\nInvitación: {{enlace_invitacion}}\nExpira: {{expira_at}}',
  },
  {
    evento: 'solicitud_rechazada',
    etiqueta: 'Solicitud rechazada',
    descripcion: 'La solicitud fue rechazada con motivo.',
    categoria: 'solicitudes',
    variables: ['empresa', 'motivo'],
    plantilla: '🚫 Solicitud rechazada\n{{empresa}}\nMotivo: {{motivo}}',
  },
  {
    evento: 'empresa_creada',
    etiqueta: 'Empresa creada',
    descripcion: 'Alta directa desde el panel (sin solicitud).',
    categoria: 'empresas',
    variables: ['empresa', 'owner_email', 'enlace_invitacion'],
    plantilla:
      '🏢 Empresa creada\n{{empresa}}\nOwner: {{owner_email}}\nInvitación: {{enlace_invitacion}}',
  },
  {
    evento: 'empresa_activada',
    etiqueta: 'Empresa activada',
    descripcion: 'El owner completó el onboarding y reclamó su empresa.',
    categoria: 'empresas',
    variables: ['empresa', 'owner'],
    plantilla: '🎉 Empresa activada\n{{empresa}} — el owner {{owner}} completó el onboarding',
  },
  {
    evento: 'empresa_suspendida',
    etiqueta: 'Empresa suspendida',
    descripcion: 'Se bloqueó el acceso de todos los miembros.',
    categoria: 'empresas',
    variables: ['empresa', 'motivo'],
    plantilla: '⏸️ Empresa suspendida\n{{empresa}}\nMotivo: {{motivo}}',
  },
  {
    evento: 'empresa_reactivada',
    etiqueta: 'Empresa reactivada',
    descripcion: 'La empresa volvió a estado activa.',
    categoria: 'empresas',
    variables: ['empresa'],
    plantilla: '▶️ Empresa reactivada\n{{empresa}}',
  },
  {
    evento: 'empresa_eliminada',
    etiqueta: 'Empresa eliminada',
    descripcion: 'Borrado definitivo de la organización.',
    categoria: 'empresas',
    variables: ['empresa'],
    plantilla: '🗑️ Empresa eliminada\n{{empresa}}',
  },
  {
    evento: 'factura_creada',
    etiqueta: 'Factura registrada',
    descripcion: 'Se registró una factura manual.',
    categoria: 'facturacion',
    variables: ['empresa', 'periodo', 'monto', 'moneda'],
    plantilla: '🧾 Factura registrada\n{{empresa}} · {{periodo}}\n{{monto}} {{moneda}}',
  },
  {
    evento: 'factura_pagada',
    etiqueta: 'Factura pagada',
    descripcion: 'Una factura se marcó como pagada.',
    categoria: 'facturacion',
    variables: ['empresa', 'periodo', 'monto', 'moneda'],
    plantilla: '💰 Factura pagada\n{{empresa}} · {{periodo}}\n{{monto}} {{moneda}}',
  },
  {
    evento: 'factura_vencida',
    etiqueta: 'Factura pendiente',
    descripcion: 'Cron: factura pendiente de un periodo anterior.',
    categoria: 'facturacion',
    variables: ['empresa', 'periodo', 'monto', 'moneda'],
    plantilla: '⚠️ Factura pendiente\n{{empresa}} · periodo {{periodo}}\n{{monto}} {{moneda}}',
  },
  {
    evento: 'suscripcion_actualizada',
    etiqueta: 'Suscripción actualizada',
    descripcion: 'Cambió el plan o estado de la suscripción.',
    categoria: 'facturacion',
    variables: ['empresa', 'plan', 'estado'],
    plantilla: '📦 Suscripción actualizada\n{{empresa}}\nPlan: {{plan}} · Estado: {{estado}}',
  },
  {
    evento: 'admin_agregado',
    etiqueta: 'Admin agregado',
    descripcion: 'Nuevo superadmin de la plataforma.',
    categoria: 'administracion',
    variables: ['email'],
    plantilla: '🛡️ Nuevo admin de plataforma\n{{email}}',
  },
  {
    evento: 'admin_quitado',
    etiqueta: 'Admin quitado',
    descripcion: 'Se removió un superadmin.',
    categoria: 'administracion',
    variables: ['email'],
    plantilla: '🛡️ Admin de plataforma removido\n{{email}}',
  },
  {
    evento: 'error_nuevo',
    etiqueta: 'Error nuevo',
    descripcion: 'Error capturado en la API o el SPA (según nivel mínimo).',
    categoria: 'salud',
    variables: ['origen', 'mensaje', 'ruta', 'empresa', 'veces'],
    plantilla:
      '🚨 Error [{{origen}}]\n{{mensaje}}\n{{ruta}}\nOrganización: {{empresa}}\nVeces: {{veces}}',
  },
  {
    evento: 'uso_limite_plan',
    etiqueta: 'Límite de plan alcanzado',
    descripcion: 'Cron: la empresa llegó al límite de miembros de su plan.',
    categoria: 'salud',
    variables: ['empresa', 'miembros', 'limite', 'plan'],
    plantilla: '📊 Límite de plan alcanzado\n{{empresa}}: {{miembros}}/{{limite}} miembros (plan {{plan}})',
  },
  {
    evento: 'resumen_diario',
    etiqueta: 'Resumen diario',
    descripcion: 'Digest programado con métricas de la plataforma.',
    categoria: 'resumen',
    variables: [
      'solicitudes_pendientes',
      'empresas_activas',
      'empresas_suspendidas',
      'empresas_nuevas_30d',
      'errores_abiertos',
      'facturas_pendientes',
      'mrr',
    ],
    plantilla:
      '📅 Resumen diario\nSolicitudes pendientes: {{solicitudes_pendientes}}\nEmpresas activas: {{empresas_activas}} · suspendidas: {{empresas_suspendidas}}\nNuevas (30d): {{empresas_nuevas_30d}}\nErrores abiertos: {{errores_abiertos}}\nFacturas pendientes: {{facturas_pendientes}}\nMRR estimado: {{mrr}}',
  },
  {
    evento: 'empresa_sin_owner',
    etiqueta: 'Empresa sin owner',
    descripcion: 'Cron: empresa creada sin reclamar tras varios días.',
    categoria: 'resumen',
    variables: ['empresa', 'creada'],
    plantilla: '⏳ Empresa sin owner\n{{empresa}} sigue sin reclamar (creada {{creada}})',
  },
  {
    evento: 'owner_inactivo',
    etiqueta: 'Owner inactivo',
    descripcion: 'Cron: owner sin actividad reciente.',
    categoria: 'resumen',
    variables: ['empresa', 'owner', 'ultima_actividad'],
    plantilla: '💤 Owner inactivo\n{{empresa}} — {{owner}} sin actividad desde {{ultima_actividad}}',
  },
];

const RE_VARIABLE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Reemplaza {{variable}} por su valor y reporta las variables sin dato. */
export function renderPlantilla(
  plantilla: string,
  variables: Record<string, unknown>
): { texto: string; faltantes: string[] } {
  const faltantes = new Set<string>();
  const texto = plantilla.replace(RE_VARIABLE, (_match, clave: string) => {
    const valor = variables[clave];
    if (valor === undefined || valor === null || valor === '') {
      faltantes.add(clave);
      return '';
    }
    return String(valor);
  });
  return { texto: texto.replace(/\n{3,}/g, '\n\n').trim(), faltantes: [...faltantes] };
}

export function definicionEvento(evento: string): EventoTelegramDef | null {
  return EVENTOS_TELEGRAM.find((e) => e.evento === evento) ?? null;
}

// ---- Zona horaria fija (Perú) ----

/** La plataforma opera en hora de Perú; no se configura por org. */
export const ZONA_HORARIA_DEFAULT = 'America/Lima';

/** Hora local (HH:MM) en una zona IANA. */
export function horaEnZona(zona: string, fecha: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zona,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(fecha);
  } catch {
    return fecha.toISOString().slice(11, 16);
  }
}

/** Fecha local (AAAA-MM-DD) en una zona IANA. */
export function fechaEnZona(zona: string, fecha: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(fecha);
  } catch {
    return fecha.toISOString().slice(0, 10);
  }
}

// ---- Esquemas de configuración (API) ----

const zHoraHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const zHorarioSilencio = z.object({
  activo: z.boolean().default(false),
  desde: zHoraHHMM.default('22:00'),
  hasta: zHoraHHMM.default('08:00'),
});

export const zConfigTelegram = z.object({
  bot_token: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null)),
  chat_destino: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null)),
  chat_etiqueta: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null)),
  enabled: z.boolean().optional(),
  nivel_minimo: z.enum(['warning', 'error']).optional(),
  agrupar_errores_segundos: z.coerce.number().int().min(0).max(86_400).optional(),
  rate_limit_hora: z.coerce.number().int().min(1).max(1000).optional(),
  quiet_hours: zHorarioSilencio.optional(),
  markdown: z.boolean().optional(),
  digest_activo: z.boolean().optional(),
  digest_hora: zHoraHHMM.optional(),
});

export const zEditarEventoTelegram = z.object({
  habilitado: z.boolean().optional(),
  plantilla: z.string().trim().min(1).max(4000).optional(),
});

export const zEditarCategoriaTelegram = z.object({
  categoria: z.string().trim().min(1).max(40),
  habilitado: z.boolean(),
});

export const zWebhookTelegram = z.object({
  base_url: z.string().url().max(300),
});

export const zEnvioPruebaTelegram = z.object({
  chat_destino: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null)),
});

// ---- Tipos de respuesta ----

export interface ConfigTelegramPlataforma {
  bot_token_mascara: string | null;
  /** De dónde sale el token efectivo: config en BD o variable de entorno. */
  token_origen: 'bd' | 'entorno' | 'ninguno';
  chat_destino: string | null;
  chat_etiqueta: string | null;
  enabled: boolean;
  nivel_minimo: 'warning' | 'error';
  agrupar_errores_segundos: number;
  rate_limit_hora: number;
  quiet_hours: { activo: boolean; desde: string; hasta: string };
  markdown: boolean;
  digest_activo: boolean;
  digest_hora: string;
  webhook_secret_configurado: boolean;
  updated_at: string | null;
}

export interface EstadoBotTelegram {
  configurado: boolean;
  /** Estado de la última consulta a Telegram. */
  consulta_ok: boolean;
  id: number | null;
  username: string | null;
  nombre: string | null;
  puede_unirse_grupos: boolean | null;
  lee_todos_los_grupos: boolean | null;
  soporta_inline: boolean | null;
  /** Descripción exacta devuelta por Telegram (o error de red). */
  error: string | null;
}

export interface EstadoWebhookTelegram {
  activo: boolean;
  url: string | null;
  pendientes: number;
  ultimo_error: string | null;
  /** Error al consultar getWebhookInfo (si lo hubo). */
  consulta_error: string | null;
}

export interface EventoTelegram extends EventoTelegramDef {
  habilitado: boolean;
  plantilla: string;
}

export interface EnvioTelegram {
  id: number;
  evento: string;
  chat: string | null;
  ok: boolean;
  status_code: number | null;
  error: string | null;
  texto: string | null;
  referencia: string | null;
  created_at: string;
}

export interface NotificacionPlataforma {
  id: number;
  evento: string;
  titulo: string;
  cuerpo: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  leida: boolean;
  created_at: string;
}

export interface ResumenSaludTelegram {
  envios_24h: number;
  fallos_24h: number;
  ultimo_envio: string | null;
}
