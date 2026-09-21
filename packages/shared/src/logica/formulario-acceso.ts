import type {
  AjustesFormulario,
  EstadoFormulario,
  EstadoInvitadoFormulario,
  MotivoAccesoFormulario,
  TipoIdentificadorFormulario,
} from '@/types';

// Reglas puras del acceso externo (clientes sin cuenta): la API las
// aplica al resolver el token público y al insertar una respuesta; el SPA
// las usa para mostrar el mensaje correcto.

export interface EntradaLista {
  tipo: TipoIdentificadorFormulario;
  valor: string;
}

/** Normaliza para comparar: correo en minúsculas; DNI sin espacios ni signos. */
export function normalizarIdentificador(
  tipo: TipoIdentificadorFormulario,
  valor: string
): string {
  const limpio = valor.trim();
  if (tipo === 'email') return limpio.toLowerCase();
  return limpio.toUpperCase().replace(/[\s.-]/g, '');
}

export function identificadorEnLista(
  entradas: EntradaLista[],
  identificador: EntradaLista
): boolean {
  const objetivo = normalizarIdentificador(
    identificador.tipo,
    identificador.valor
  );
  return entradas.some(
    (e) =>
      e.tipo === identificador.tipo &&
      normalizarIdentificador(e.tipo, e.valor) === objetivo
  );
}

export interface ContextoAccesoFormulario {
  estado: EstadoFormulario;
  /** Invitado resuelto por link personal (null = link general). */
  invitado?: { estado: EstadoInvitadoFormulario } | null;
  /** Identificador aportado por el visitante (DNI o correo). */
  identificador?: EntradaLista | null;
  /** Filas de la lista blanca/negra del formulario. */
  lista?: EntradaLista[];
  /** Ya existe una respuesta con este invitado o identificador. */
  yaRespondio?: boolean;
}

/**
 * Evalúa si un visitante externo puede responder. El link personal manda:
 * un invitado válido responde aunque el modo sea personal y no se
 * re-valida contra listas (su identidad ya está fijada por el token).
 */
export function evaluarAccesoFormulario(
  ajustes: AjustesFormulario,
  ctx: ContextoAccesoFormulario
): { permitido: boolean; motivo: MotivoAccesoFormulario } {
  if (ctx.estado !== 'publicado') {
    return { permitido: false, motivo: 'no_publicado' };
  }

  if (ctx.invitado) {
    if (ctx.invitado.estado === 'revocado') {
      return { permitido: false, motivo: 'invitado_revocado' };
    }
    if (ctx.invitado.estado === 'respondido' || ctx.yaRespondio) {
      return { permitido: false, motivo: 'ya_respondio' };
    }
    return { permitido: true, motivo: 'ok' };
  }

  if (ajustes.modo_acceso === 'personal') {
    return { permitido: false, motivo: 'requiere_invitacion' };
  }

  if (ajustes.modo_acceso === 'publico') {
    if (ctx.yaRespondio) return { permitido: false, motivo: 'ya_respondio' };
    return { permitido: true, motivo: 'ok' };
  }

  // modo 'lista': exige identificador válido y decide la lista.
  const identificador = ctx.identificador;
  if (!identificador) {
    return { permitido: false, motivo: 'requiere_identificacion' };
  }
  if (!ajustes.identificadores.includes(identificador.tipo)) {
    return { permitido: false, motivo: 'identificador_invalido' };
  }

  const enLista = identificadorEnLista(ctx.lista ?? [], identificador);
  const permitido =
    ajustes.lista_modo === 'blanca' ? enLista : !enLista;

  if (!permitido) {
    return {
      permitido: false,
      motivo: ajustes.lista_modo === 'blanca' ? 'no_listado' : 'bloqueado',
    };
  }
  if (ctx.yaRespondio) return { permitido: false, motivo: 'ya_respondio' };
  return { permitido: true, motivo: 'ok' };
}

export function mensajeAcceso(motivo: MotivoAccesoFormulario): string {
  switch (motivo) {
    case 'ok':
      return '';
    case 'no_publicado':
      return 'Este formulario no está disponible por el momento.';
    case 'requiere_identificacion':
      return 'Ingresa tu documento o correo para continuar.';
    case 'identificador_invalido':
      return 'El tipo de identificación no es válido para este formulario.';
    case 'no_listado':
      return 'Tu identificación no está autorizada para responder este formulario.';
    case 'bloqueado':
      return 'Tu identificación no puede responder este formulario.';
    case 'requiere_invitacion':
      return 'Necesitas el enlace personal que te compartieron para responder.';
    case 'invitado_revocado':
      return 'Tu invitación fue anulada. Contacta a quien te la compartió.';
    case 'ya_respondio':
      return 'Ya registramos una respuesta tuya para este formulario.';
  }
}
