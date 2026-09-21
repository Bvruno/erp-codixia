export type UserRole = "admin" | "collaborator";

export type TaskStatus = string;

export type Visibility = "public" | "private" | "restricted";

export type EntityPermission = "read" | "write" | "manage";

export type EntityType = "workspace" | "folder" | "list" | "document" | "mindmap" | "todo" | "formulario";

export interface EntityGrant {
  entity_type: EntityType;
  entity_id: string;
  profile_id: string;
  permission: EntityPermission;
  inherit: boolean;
  created_at: string;
}

export type TaskPriority = string;

export interface StatusDef {
  key: string;
  label: string;
  color: string;
  hidden_by_default?: boolean;
}

export interface PriorityDef {
  key: string;
  label: string;
  color: string;
}

export type InvitationStatus =
  "pending" | "accepted" | "rejected" | "expired" | "cancelled";

export type PermissionStatus = "pending" | "approved" | "rejected";

export type TimeEntryType = "worked" | "permission" | "overtime" | "makeup";

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export type ThemePreference = "dark" | "light" | "system";
export type TimeFormat = "12h" | "24h";
export type WeekStart = "monday" | "sunday";
export type DefaultView = "calendario" | "proyectos" | "pipeline";
export type ReminderBefore = "none" | "30m" | "1h" | "1d";

export interface ProfilePreferences {
  theme: ThemePreference;
  language: "es";
  density: "normal" | "compact";
  high_contrast: boolean;
  reduce_motion: boolean;
  time_format: TimeFormat;
  week_start: WeekStart;
  work_days: number[];
  workday_start: string;
  default_view: DefaultView;
  reminder_before: ReminderBefore;
  show_done_cancelled: boolean;
  notif: {
    task_assigned: boolean;
    task_status: boolean;
    note_added: boolean;
    permission: boolean;
  };
}

export const DEFAULT_PREFERENCES: ProfilePreferences = {
  theme: "system",
  language: "es",
  density: "normal",
  high_contrast: false,
  reduce_motion: false,
  time_format: "24h",
  week_start: "monday",
  work_days: [1, 2, 3, 4, 5],
  workday_start: "09:00",
  default_view: "calendario",
  reminder_before: "none",
  show_done_cancelled: false,
  notif: {
    task_assigned: true,
    task_status: true,
    note_added: true,
    permission: true,
  },
};

export interface Profile {
  id: string;
  email?: string;
  organization_id: string;
  role: UserRole;
  is_owner: boolean;
  full_name: string;
  telegram_chat_id: string | null;
  blocked: boolean;
  access_mode?: "org" | "grants_only";
  daily_hours: number;
  weekly_hours: number;
  phone: string | null;
  position: string | null;
  bio: string | null;
  language: string;
  birth_date: string | null;
  address: string | null;
  alternate_phones: string[] | null;
  emergency_contacts: EmergencyContact[] | null;
  preferences: ProfilePreferences | null;
  created_at: string;
}

export interface Shift {
  id: string;
  organization_id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  crosses_midnight: boolean;
  break_start_time: string | null;
  break_end_time: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  organization_id: string;
  user_id: string;
  shift_id: string;
  day_of_week: number;
  created_by: string | null;
  created_at: string;
  shift?: Shift | null;
}

export interface Workspace {
  id: string;
  organization_id: string;
  name: string;
  position: number;
  visibility: Visibility;
  default_statuses: StatusDef[] | null;
  default_priorities: PriorityDef[] | null;
  created_at: string;
}

export interface WorkspaceFolder {
  id: string;
  workspace_id: string;
  parent_folder_id: string | null;
  name: string;
  position: number;
  visibility: Visibility;
  created_at: string;
}

export interface TaskList {
  id: string;
  workspace_id: string;
  organization_id: string;
  folder_id: string | null;
  name: string;
  position: number;
  visibility: Visibility;
  statuses: StatusDef[] | null;
  priorities: PriorityDef[] | null;
  created_at: string;
}

export interface TaskDocument {
  id: string;
  organization_id: string;
  workspace_id: string;
  folder_id: string | null;
  name: string;
  visibility: Visibility;
  position: number;
  created_at: string;
}

export interface DocumentPage {
  id: string;
  document_id: string;
  title: string;
  content: string;
  is_main: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export type MindMapNodeKind =
  | "idea"
  | "task"
  | "decision"
  | "note"
  | "image"
  | "shape"
  | "text"
  | "draw";

/** Formas básicas estilo Excalidraw para el nodo `shape`. */
export type MindMapShape = "rect" | "ellipse" | "diamond" | "triangle";

export interface MindMapNodeData {
  label: string;
  notes?: string;
  color: string;
  labels: string[];
  priority: string | null;
  done?: boolean;
  image?: { url: string; alt?: string } | null;
  /** Forma del nodo `shape`. */
  shape?: MindMapShape;
  /** Trazo libre: puntos [x, y] locales al nodo (nodo `draw`). */
  points?: number[][];
  /** Grosor de trazo del nodo `draw` (px en coords flow). */
  strokeWidth?: number;
  /** Tamaño de fuente del nodo `text` (px). */
  fontSize?: number;
  [key: string]: unknown;
}

export interface MindMapSnapshotNode {
  id: string;
  type: MindMapNodeKind;
  x: number;
  y: number;
  /** Solo presente si el usuario redimensionó el nodo. */
  width?: number;
  /** Solo presente si el usuario redimensionó el nodo. */
  height?: number;
  data: MindMapNodeData;
}

export type MindMapEdgeKind = "bezier" | "straight" | "step";

export interface MindMapSnapshotEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string | null;
  /** Tipo de trazado de la conexión (default: bezier). */
  kind?: MindMapEdgeKind;
  /** Línea discontinua. */
  dashed?: boolean;
  /** Flecha al final de la conexión (default: true). */
  arrow?: boolean;
}

export interface MindMapSnapshot {
  version: number;
  nodes: MindMapSnapshotNode[];
  edges: MindMapSnapshotEdge[];
  viewport: { x: number; y: number; zoom: number } | null;
}

export interface MindMap {
  id: string;
  organization_id: string;
  workspace_id: string;
  folder_id: string | null;
  name: string;
  visibility: Visibility;
  content: MindMapSnapshot | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  organization_id: string;
  parent_task_id: string | null;
  list_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  created_by: string | null;
  shift_id: string | null;
  due_date: string | null;
  due_time: string | null;
  start_date: string | null;
  estimated_hours: number | null;
  position: number;
  status_position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  assigned_profile?: Profile | null;
  created_profile?: Profile | null;
  shift?: Shift | null;
  sub_tasks?: Task[];
}

export interface TaskNote {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Profile | null;
}

export interface Invitation {
  id: string;
  organization_id: string;
  token: string;
  created_by: string;
  expires_at: string;
  status: InvitationStatus;
  role: UserRole;
  entity_type: EntityType | null;
  entity_id: string | null;
  permission: EntityPermission | null;
  inherit: boolean;
  created_at: string;
  organization?: Organization | null;
  creator?: Profile | null;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  organization_id: string;
  date: string;
  hours: number;
  type: TimeEntryType;
  created_at: string;
  user?: Profile | null;
}

export interface Permission {
  id: string;
  user_id: string;
  organization_id: string;
  reason: string;
  date: string;
  estimated_hours: number;
  makeup_date: string | null;
  status: PermissionStatus;
  created_at: string;
  user?: Profile | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type:
    | "task_assigned"
    | "task_status"
    | "note_added"
    | "invitation"
    | "permission";
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  read: boolean;
  created_at: string;
}

export interface TelegramConfig {
  id: string;
  organization_id: string;
  bot_token: string;
  enabled: boolean;
  created_at: string;
}

export interface OrgSettings {
  organization_id: string;
  daily_hours: number;
  weekly_hours: number;
  timezone: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
}

export type TodoFrequency = "daily" | "weekly" | "shift" | "interval";

export interface Todo {
  id: string;
  organization_id: string;
  workspace_id: string;
  folder_id: string | null;
  name: string;
  visibility: Visibility;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TodoItem {
  id: string;
  todo_id: string;
  name: string;
  frequency: TodoFrequency;
  interval_days: number | null;
  target_quantity: number;
  active: boolean;
  week_days: number[] | null;
  due_time: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TodoProgress {
  id: string;
  template_id: string;
  profile_id: string;
  cycle_start: string;
  quantity_done: number;
  updated_at: string;
}

export interface TodoBoardRow {
  id: string;
  name: string;
  frequency: TodoFrequency;
  interval_days: number | null;
  target_quantity: number;
  active: boolean;
  week_days: number[] | null;
  due_time: string | null;
  quantity_done: number;
  cycle_start: string;
  cycle_end: string;
}

export interface Note {
  id: string;
  organization_id: string;
  created_by: string;
  note_date: string;
  title: string;
  content: string | null;
  drawing: Record<string, unknown> | null;
  image: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskActivityLog {
  id: string;
  task_id: string;
  user_id: string | null;
  action:
    | "created"
    | "status_changed"
    | "assigned"
    | "priority_changed"
    | "due_date_changed"
    | "hours_changed"
    | "title_changed";
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  user?: Profile | null;
}

// ============================================================
// Formularios (0063)
// ============================================================

export type EstadoFormulario = "borrador" | "publicado" | "cerrado";

/** Quién puede responder desde el enlace externo. */
export type ModoAccesoFormulario =
  | "publico" // cualquiera con el link
  | "lista" // solo identificados presentes/ausentes en la lista blanca/negra
  | "personal"; // solo links personales dirigidos

export type TipoIdentificadorFormulario = "dni" | "email";

export type TipoPregunta =
  | "texto_corto"
  | "texto_largo"
  | "opcion_multiple"
  | "casillas"
  | "desplegable"
  | "escala"
  | "fecha"
  | "hora"
  | "numero"
  | "email";

export interface OpcionPregunta {
  id: string;
  etiqueta: string;
}

export interface EscalaPregunta {
  min: number;
  max: number;
  etiqueta_min?: string;
  etiqueta_max?: string;
}

/** Validación extra para respuestas de texto corto. */
export type ValidacionTexto = "texto" | "numero" | "email";

export interface ValidacionTextoConfig {
  modo: ValidacionTexto;
  /** Solo modo numero: cantidad de dígitos permitida. */
  digitos_min?: number;
  digitos_max?: number;
}

export interface PreguntaFormulario {
  id: string;
  tipo: TipoPregunta;
  titulo: string;
  descripcion?: string;
  requerida: boolean;
  /** opcion_multiple, casillas y desplegable. */
  opciones?: OpcionPregunta[];
  escala?: EscalaPregunta;
  numero?: { min?: number; max?: number };
  max_caracteres?: number;
  /** Solo texto_corto: exige texto, número (dígitos) o correo. */
  validacion_texto?: ValidacionTextoConfig | null;
  /** Lógica condicional: solo se muestra si la regla se cumple. */
  logica?: LogicaPregunta | null;
}

// ---- Lógica condicional (IF) ----

export type OperadorCondicion =
  | "igual"
  | "distinto"
  | "incluye"
  | "mayor"
  | "menor"
  | "mayor_igual"
  | "menor_igual"
  | "contiene_texto"
  | "respondida"
  | "no_respondida";

export interface CondicionFormulario {
  /** Pregunta anterior que se evalúa. */
  pregunta_id: string;
  operador: OperadorCondicion;
  /** Opción, número o texto según el operador (ausente en respondida). */
  valor?: string | number;
}

export interface ReglaLogica {
  id: string;
  condiciones: CondicionFormulario[];
  modo: "todas" | "alguna";
}

export interface LogicaPregunta {
  mostrar_si: ReglaLogica;
}

export interface RamaSeccion {
  id: string;
  regla: ReglaLogica;
  /** id de sección posterior o 'enviar' para terminar. */
  destino: string | "enviar";
}

export interface SeccionFormulario {
  id: string;
  titulo: string;
  descripcion?: string;
  preguntas: PreguntaFormulario[];
  /** Ramas al terminar la sección; gana la primera que cumpla. */
  ramas?: RamaSeccion[];
}

export interface FormularioEsquema {
  version: number;
  secciones: SeccionFormulario[];
}

export interface AjustesFormulario {
  modo_acceso: ModoAccesoFormulario;
  /** blanca: solo los listados; negra: todos menos los listados. */
  lista_modo: "blanca" | "negra";
  identificadores: TipoIdentificadorFormulario[];
  una_respuesta_por_persona: boolean;
  requiere_consentimiento: boolean;
  texto_privacidad: string;
  mensaje_confirmacion: string;
}

export interface Formulario {
  id: string;
  organization_id: string;
  workspace_id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  visibility: Visibility;
  estado: EstadoFormulario;
  position: number;
  esquema: FormularioEsquema;
  ajustes: AjustesFormulario;
  publicado_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormularioLista {
  id: string;
  formulario_id: string;
  tipo: TipoIdentificadorFormulario;
  valor: string;
  etiqueta: string | null;
  created_at: string;
}

export type EstadoInvitadoFormulario = "pendiente" | "respondido" | "revocado";

export interface FormularioInvitado {
  id: string;
  formulario_id: string;
  nombre: string;
  tipo: TipoIdentificadorFormulario | null;
  valor: string | null;
  estado: EstadoInvitadoFormulario;
  respondido_at: string | null;
  created_at: string;
}

/** Respuestas indexadas por id de pregunta. */
export type RespuestasFormulario = Record<string, unknown>;

export interface FormularioRespuesta {
  id: string;
  formulario_id: string;
  profile_id: string | null;
  invitado_id: string | null;
  identificador_hash: string | null;
  consentimiento: boolean;
  respuestas: RespuestasFormulario;
  created_at: string;
  /** Presente cuando la respuesta vino de un link personal. */
  invitado_nombre?: string | null;
}

// ---- Vista pública (sin datos internos) ----

export interface FormularioPublico {
  id: string;
  nombre: string;
  descripcion: string | null;
  esquema: FormularioEsquema;
  modo_acceso: ModoAccesoFormulario;
  identificadores: TipoIdentificadorFormulario[];
  requiere_consentimiento: boolean;
  texto_privacidad: string;
  mensaje_confirmacion: string;
}

export interface InvitadoPublico {
  nombre: string;
  ya_respondio: boolean;
}

// ---- Resumen de respuestas (dashboard capa 3) ----

export interface ConteoOpcion {
  valor: string;
  etiqueta: string;
  conteo: number;
  porcentaje: number;
}

export interface ResumenPregunta {
  pregunta_id: string;
  tipo: TipoPregunta;
  titulo: string;
  /** Respuestas no vacías para esta pregunta. */
  total: number;
  /** Distribución para opciones, casillas, escala, fecha y hora. */
  conteos?: ConteoOpcion[];
  promedio?: number | null;
  minimo?: number | null;
  maximo?: number | null;
  /** Textos libres (texto_corto/largo/email). */
  textos?: string[];
}

export interface ErrorRespuestaFormulario {
  pregunta_id: string;
  mensaje: string;
}

export type MotivoAccesoFormulario =
  | "ok"
  | "no_publicado"
  | "requiere_identificacion"
  | "identificador_invalido"
  | "no_listado"
  | "bloqueado"
  | "requiere_invitacion"
  | "invitado_revocado"
  | "ya_respondio";

export const AJUSTES_FORMULARIO_DEFAULT: AjustesFormulario = {
  modo_acceso: "publico",
  lista_modo: "blanca",
  identificadores: ["dni", "email"],
  una_respuesta_por_persona: false,
  requiere_consentimiento: false,
  texto_privacidad: "",
  mensaje_confirmacion: "Gracias por tu respuesta.",
};
