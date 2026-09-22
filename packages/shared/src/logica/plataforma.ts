import { z } from 'zod';

// Contrato de la plataforma de owners (SaaS): funnel público,
// gestión de empresas, planes, facturación manual y auditoría.
// La API valida con estos esquemas y el SPA los reutiliza.

export const ESTADOS_SOLICITUD = [
  'pendiente',
  'en_revision',
  'aprobada',
  'rechazada',
  'invitada',
  'activada',
] as const;

export const TAMANOS_EQUIPO = ['1-5', '6-20', '21-50', '51-200', '200+'] as const;

export const ESTADOS_ORG = ['activa', 'suspendida'] as const;
export const ESTADOS_SUSCRIPCION = ['prueba', 'activa', 'mora', 'cancelada'] as const;
export const ESTADOS_FACTURA = ['pendiente', 'pagada', 'anulada'] as const;

export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];
export type EstadoOrg = (typeof ESTADOS_ORG)[number];
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];
export type TamanoEquipo = (typeof TAMANOS_EQUIPO)[number];

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v ?? null));

// ---- Funnel público ----

export const zSolicitudOwner = z.object({
  nombre_contacto: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  telefono: textoOpcional(40),
  empresa: z.string().trim().min(1).max(160),
  sitio_web: textoOpcional(200),
  pais: textoOpcional(80),
  sector: textoOpcional(80),
  tamano_equipo: z.enum(TAMANOS_EQUIPO).optional().nullable(),
  motivacion: textoOpcional(2000),
  referido_por: textoOpcional(160),
  consentimiento: z.literal(true),
  /** Honeypot anti-bots: si viene con valor, se descarta. */
  website: z.string().max(200).optional(),
});

export type SolicitudOwnerInput = z.infer<typeof zSolicitudOwner>;

// ---- Gestión (panel) ----

export const zRevisarSolicitud = z.object({
  estado: z.enum(['en_revision', 'rechazada']).optional(),
  notas_admin: textoOpcional(2000),
});

export const zRechazarSolicitud = z.object({
  motivo: z.string().trim().min(1).max(1000),
});

export const zCrearEmpresaOwner = z.object({
  nombre: z.string().trim().min(1).max(160),
  email_owner: textoOpcional(200),
  plan_id: z.string().trim().max(40).optional().nullable(),
  dias_invitacion: z.coerce.number().int().min(1).max(90).default(14),
  notas: textoOpcional(1000),
});

export const zSuspenderEmpresa = z.object({
  motivo: z.string().trim().min(1).max(500),
});

export const zEliminarEmpresa = z.object({
  confirmacion: z.string().trim().min(1).max(160),
});

export const zSuscripcion = z.object({
  plan_id: z.string().trim().min(1).max(40),
  estado: z.enum(ESTADOS_SUSCRIPCION).default('activa'),
  periodo_inicio: z.string().trim().max(10).optional().nullable(),
  periodo_fin: z.string().trim().max(10).optional().nullable(),
  precio_acordado: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  notas: textoOpcional(1000),
});

export const zPlan = z.object({
  id: z.string().trim().min(1).max(40),
  nombre: z.string().trim().min(1).max(80),
  precio_mensual: z.coerce.number().min(0).max(1_000_000),
  moneda: z.string().trim().min(1).max(8).default('USD'),
  limites: z.record(z.string(), z.unknown()).default({}),
  orden: z.coerce.number().int().min(0).max(1000).default(0),
});

export const zFactura = z.object({
  organization_id: z.string().uuid(),
  periodo: z.string().trim().min(7).max(10),
  monto: z.coerce.number().min(0).max(1_000_000),
  moneda: z.string().trim().min(1).max(8).default('USD'),
  estado: z.enum(ESTADOS_FACTURA).default('pendiente'),
  metodo: textoOpcional(80),
  notas: textoOpcional(1000),
});

export const zNuevoPlatformAdmin = z.object({
  email: z.string().trim().email().max(200),
});

// ---- Filas (respuestas de la API) ----

export interface SolicitudOwner {
  id: string;
  nombre_contacto: string;
  email: string;
  telefono: string | null;
  empresa: string;
  sitio_web: string | null;
  pais: string | null;
  sector: string | null;
  tamano_equipo: string | null;
  motivacion: string | null;
  referido_por: string | null;
  estado: EstadoSolicitud;
  notas_admin: string | null;
  organization_id: string | null;
  invitation_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmpresaPlataforma {
  id: string;
  nombre: string;
  estado: EstadoOrg;
  suspendida_at: string | null;
  suspension_motivo: string | null;
  plan_id: string | null;
  plan_nombre: string | null;
  owner_id: string | null;
  owner_nombre: string | null;
  owner_email: string | null;
  miembros: number;
  miembros_activos_30d: number;
  suscripcion_estado: EstadoSuscripcion | null;
  creada_at: string;
  ultima_actividad: string | null;
}

export interface Plan {
  id: string;
  nombre: string;
  precio_mensual: number;
  moneda: string;
  limites: Record<string, unknown>;
  orden: number;
}

export interface Suscripcion {
  organization_id: string;
  plan_id: string;
  estado: EstadoSuscripcion;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  precio_acordado: number | null;
  notas: string | null;
  updated_at: string;
}

export interface Factura {
  id: string;
  organization_id: string;
  empresa_nombre?: string;
  periodo: string;
  monto: number;
  moneda: string;
  estado: EstadoFactura;
  pagado_at: string | null;
  metodo: string | null;
  notas: string | null;
  created_at: string;
}

export interface PlatformAdmin {
  user_id: string;
  email: string | null;
  nombre: string | null;
  created_at: string;
  es_yo: boolean;
}

export interface EntradaAuditoriaPlataforma {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  accion: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface EstadisticasPlataforma {
  empresas: {
    total: number;
    activas: number;
    suspendidas: number;
    nuevas_30d: number;
  };
  solicitudes: Record<EstadoSolicitud, number>;
  planes: { plan_id: string; plan_nombre: string; empresas: number; mrr: number }[];
  uso: {
    miembros_totales: number;
    miembros_activos_30d: number;
    tareas_abiertas: number;
    documentos: number;
    facturado_30d: number;
    cobrado_30d: number;
  };
  mrr_estimado: number;
}

export interface Pagina<T> {
  data: T[];
  total: number;
}
