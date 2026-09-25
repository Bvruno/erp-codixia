import { api } from './cliente';
import type {
  EmpresaPlataforma,
  EntradaAuditoriaPlataforma,
  EstadoOrg,
  Factura,
  Pagina,
  PlatformAdmin,
  Plan,
  SolicitudOwner,
  Suscripcion,
  EstadoSolicitud,
  EstadoSuscripcion,
  EstadoFactura,
  EstadisticasPlataforma,
} from '@erp/shared/plataforma';
import type {
  CategoriaTelegram,
  ConfigTelegramPlataforma,
  EnvioTelegram,
  EstadoBotTelegram,
  EstadoWebhookTelegram,
  EventoTelegram,
  NotificacionPlataforma,
  ResumenSaludTelegram,
} from '@erp/shared/telegram-plataforma';

function query(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === '') continue;
    qs.set(clave, String(valor));
  }
  const texto = qs.toString();
  return texto ? `?${texto}` : '';
}

// ---- Solicitudes ----

export function listarSolicitudes(params: {
  estado?: EstadoSolicitud | '';
  q?: string;
  page?: number;
}) {
  return api.get<Pagina<SolicitudOwner> & { page: number; pageSize: number }>(
    `/plataforma/solicitudes${query(params)}`
  );
}

export function actualizarSolicitud(
  id: string,
  cambios: { estado?: 'en_revision' | 'rechazada'; notas_admin?: string | null }
) {
  return api.patch<{ data: SolicitudOwner }>(`/plataforma/solicitudes/${id}`, cambios);
}

export function aprobarSolicitud(
  id: string,
  datos: { nombre?: string; plan_id?: string | null; dias_invitacion?: number; notas?: string }
) {
  return api.post<{ ok: true; organization_id: string; link: string; expira_at: string }>(
    `/plataforma/solicitudes/${id}/aprobar`,
    datos
  );
}

export function rechazarSolicitud(id: string, motivo: string) {
  return api.post<{ ok: true }>(`/plataforma/solicitudes/${id}/rechazar`, { motivo });
}

// ---- Empresas ----

export function listarEmpresas(params: {
  estado?: EstadoOrg | '';
  plan?: string;
  q?: string;
  page?: number;
}) {
  return api.get<Pagina<EmpresaPlataforma> & { page: number; pageSize: number }>(
    `/plataforma/empresas${query(params)}`
  );
}

export interface EmpresaDetalle extends EmpresaPlataforma {
  uso: {
    tareas_abiertas: number;
    tareas_total: number;
    documentos: number;
    formularios: number;
  };
  suscripcion: Suscripcion | null;
  facturas: Factura[];
}

export function obtenerEmpresa(id: string) {
  return api.get<{ data: EmpresaDetalle }>(`/plataforma/empresas/${id}`);
}

export function crearEmpresa(datos: {
  nombre: string;
  email_owner?: string | null;
  plan_id?: string | null;
  dias_invitacion?: number;
}) {
  return api.post<{ ok: true; organization_id: string; link: string }>(
    '/plataforma/empresas',
    datos
  );
}

export function suspenderEmpresa(id: string, motivo: string) {
  return api.post<{ ok: true }>(`/plataforma/empresas/${id}/suspender`, { motivo });
}

export function reactivarEmpresa(id: string) {
  return api.post<{ ok: true }>(`/plataforma/empresas/${id}/reactivar`);
}

export function eliminarEmpresa(id: string, confirmacion: string) {
  return api.delete<{ ok: true }>(`/plataforma/empresas/${id}`, { confirmacion });
}

// ---- Planes y facturación ----

export function listarPlanes() {
  return api.get<{ data: Plan[] }>('/plataforma/planes');
}

export function guardarPlan(plan: Omit<Plan, 'id'> & { id: string }) {
  return api.put<{ data: Plan }>(`/plataforma/planes/${plan.id}`, plan);
}

export function guardarSuscripcion(
  organizationId: string,
  datos: {
    plan_id: string;
    estado: EstadoSuscripcion;
    periodo_inicio?: string | null;
    periodo_fin?: string | null;
    precio_acordado?: number | null;
    notas?: string | null;
  }
) {
  return api.put<{ data: Suscripcion }>(
    `/plataforma/empresas/${organizationId}/suscripcion`,
    datos
  );
}

export function listarFacturas(params: {
  estado?: EstadoFactura | '';
  organization_id?: string;
  page?: number;
}) {
  return api.get<Pagina<Factura> & { page: number; pageSize: number }>(
    `/plataforma/facturas${query(params)}`
  );
}

export function crearFactura(datos: {
  organization_id: string;
  periodo: string;
  monto: number;
  moneda?: string;
  estado?: EstadoFactura;
  metodo?: string | null;
  notas?: string | null;
}) {
  return api.post<{ data: Factura }>('/plataforma/facturas', datos);
}

export function actualizarFactura(
  id: string,
  datos: { estado: EstadoFactura; metodo?: string | null; notas?: string | null }
) {
  return api.patch<{ data: Factura }>(`/plataforma/facturas/${id}`, datos);
}

// ---- Administradores ----

export function listarAdmins() {
  return api.get<{ data: PlatformAdmin[] }>('/plataforma/admins');
}

export function agregarAdmin(email: string) {
  return api.post<{ ok: true; user_id: string }>('/plataforma/admins', { email });
}

export function quitarAdmin(userId: string) {
  return api.delete<{ ok: true }>(`/plataforma/admins/${userId}`);
}

// ---- Estadísticas y auditoría ----

export function obtenerEstadisticas() {
  return api.get<{ data: EstadisticasPlataforma }>('/plataforma/estadisticas');
}

export function listarAuditoria(params: {
  entidad_tipo?: string;
  entidad_id?: string;
  page?: number;
}) {
  return api.get<Pagina<EntradaAuditoriaPlataforma> & { page: number; pageSize: number }>(
    `/plataforma/auditoria${query(params)}`
  );
}

// ---- Telegram de plataforma ----

export interface RespuestaConfigTelegram {
  data: ConfigTelegramPlataforma;
  bot: EstadoBotTelegram;
  webhook: EstadoWebhookTelegram;
  salud: ResumenSaludTelegram;
}

export function obtenerConfigTelegram() {
  return api.get<RespuestaConfigTelegram>('/plataforma/telegram/config');
}

export function guardarConfigTelegram(
  cambios: Partial<{
    bot_token: string | null;
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
  }>
) {
  return api.put<RespuestaConfigTelegram>('/plataforma/telegram/config', cambios);
}

export function probarBotTelegram(bot_token?: string) {
  return api.post<{
    ok: boolean;
    bot: EstadoBotTelegram | null;
    error: string | null;
    token_origen: 'bd' | 'entorno' | 'ninguno';
    es_token_guardado: boolean;
  }>('/plataforma/telegram/config/probar', { bot_token: bot_token ?? null });
}

export function activarWebhookTelegram(base_url: string) {
  return api.post<{ ok: true; webhook: EstadoWebhookTelegram | null }>(
    '/plataforma/telegram/webhook',
    { base_url }
  );
}

export function desactivarWebhookTelegram() {
  return api.delete<{ ok: true }>('/plataforma/telegram/webhook');
}

export function sincronizarTelegram() {
  return api.post<{ ok: true; procesados: number; vinculado: boolean; offset: number }>(
    '/plataforma/telegram/sincronizar'
  );
}

export function listarEventosTelegram() {
  return api.get<{
    data: EventoTelegram[];
    categorias: { id: CategoriaTelegram; etiqueta: string; descripcion: string }[];
  }>('/plataforma/telegram/eventos');
}

export function guardarEventoTelegram(
  evento: string,
  cambios: { habilitado?: boolean; plantilla?: string }
) {
  return api.put<{ data: EventoTelegram }>(`/plataforma/telegram/eventos/${evento}`, cambios);
}

export function restaurarEventoTelegram(evento: string) {
  return api.post<{ data: EventoTelegram }>(`/plataforma/telegram/eventos/${evento}/restaurar`);
}

export function cambiarCategoriaTelegram(categoria: CategoriaTelegram, habilitado: boolean) {
  return api.put<{ ok: true; actualizados: number }>('/plataforma/telegram/eventos', {
    categoria,
    habilitado,
  });
}

export function listarEnviosTelegram(params: {
  evento?: string;
  estado?: 'ok' | 'fallo' | '';
  page?: number;
}) {
  return api.get<Pagina<EnvioTelegram> & { page: number; pageSize: number }>(
    `/plataforma/telegram/envios${query(params)}`
  );
}

export function probarEnvioTelegram(chat_destino?: string | null) {
  return api.post<{ ok: true }>('/plataforma/telegram/envios/probar', {
    chat_destino: chat_destino ?? null,
  });
}

export function listarNotificacionesTelegram() {
  return api.get<{ data: NotificacionPlataforma[]; no_leidas: number }>(
    '/plataforma/telegram/notificaciones'
  );
}

export function marcarNotificacionesLeidas(ids?: number[]) {
  return api.post<{ ok: true; marcadas: number }>('/plataforma/telegram/notificaciones/leer', {
    ids,
  });
}
