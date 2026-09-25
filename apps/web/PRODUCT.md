# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Usuario primario confirmado: **dueño/admin de PyME**. Trabaja en escritorio, en
horario laboral de Perú (`America/Lima` por defecto en onboarding) y
usa el ERP para coordinar el trabajo completo de su empresa: proyectos, tareas,
documentos y turnos del equipo.

Contexto de uso: crea la organización, invita a su equipo y asigna trabajo desde
una sola SPA.

El rol `collaborator` existe en el modelo (admin | collaborator) y usa la misma
SPA para su trabajo asignado; no confirmado como usuario primario, pero su flujo
es parte del producto.

## Product Purpose

ERP Codixia es una plataforma SaaS multiempresa de gestión de proyectos, tareas,
documentos y turnos. Existe para que una PyME deje de repartir su operación entre
varias herramientas y la gestione en un solo lugar integrado.

Éxito: el dueño/admin coordina el trabajo completo de su equipo —qué se hace,
quién lo hace y cuándo— desde el ERP, sin saltar a otra herramienta.

## Positioning

Diferenciales confirmados por el usuario (los cuatro aplican):

- **Todo en uno**: proyectos, tareas, documentos, mapas mentales, formularios y
  turnos conviven en la misma herramienta.
- **Turnos + proyectos integrados**: horarios/turnos no son un módulo aparte;
  se leen junto al trabajo asignado.
- **Permisos finos**: jerarquía y visibilidad por entidad/carpeta, con compartir
  a colaboradores e invitados externos.
- **Formularios hacia el proyecto**: formularios públicos y para invitados que
  recolectan respuestas que aterrizan en el proyecto.

## Operating Context

- Multiempresa (`organizations`) con roles admin/collaborator; un admin solo ve
  su organización.
- Jerarquía de contenido: proyectos → carpetas → ítems (tareas, todos, listas,
  mapas mentales, documentos de texto enriquecido, formularios con respuestas).
- Vistas de trabajo: pipeline, calendario, horarios/turnos, colaboradores,
  perfil y configuración; notificaciones por campana.
- Flujos públicos: login/signup, invitación por token, restablecer contraseña,
  onboarding de empresa (jornada por defecto 8 h/día, 40 h/semana) y formularios
  públicos/para invitados en `/f/...`.
- Colaboración en tiempo real vía WebSocket de la API; los permisos se deciden
  en la base de datos (RLS), no se replican en el SPA.

## Capabilities and Constraints

- SPA Vite 8 + React 19 + TanStack Router (file-based) + Tailwind v4 + TanStack
  Query; datos vía API Hono + Zod con `Bearer`; Supabase-js solo para
  auth/sesión (regla arquitectónica verificada por test).
- Multi-tenant con RLS; permisos jerárquicos con herencia capada a write,
  `private` corta la herencia y admin aislado por org.
- Español es el único idioma del producto y del código (identificadores, rutas,
  UI, commits).
- Navegador moderno, sin polyfills.
- Restricciones de seguridad/privacidad del proyecto: validación Zod de todo
  input, sin secretos en el bundle, sin PII en logs, minimización de datos.
- Mobile-first es el estándar declarado del proyecto; el uso confirmado del
  usuario primario es de escritorio.

Hechos no decididos: ninguno registrado en esta ronda.

## Brand Commitments

- **Nombre/marca Codixia** confirmado como compromiso a preservar.
- No hay assets de marca en el repositorio (solo `public/robots.txt`): no
  inventar logotipos, claims ni identidad visual.

## Evidence on Hand

- **Sin clientes reales aún**: no fabricar testimonios, clientes, casos de éxito
  ni métricas.
- Existe despliegue productivo configurado (Render + Supabase remoto) con
  historial de migraciones; sin evidencia comercial pública.
- Dato demo de desarrollo: empresa/usuario `owner.demo@demo.com` tras el seed.
- Estándares de ingeniería del repo (`AGENTS.md`, `README.md`) son evidencia
  vinculante para el trabajo futuro sobre este producto.

## Product Principles

1. **Un solo lugar**: cada capacidad nueva debe reducir las herramientas que el
   dueño de PyME usa, no agregar otra.
2. **Turnos y proyectos son un mismo sistema**: horario y trabajo asignado se
   leen juntos.
3. **Permisos como producto, no como plomería**: compartir fino debe decidirse
   en BD y sentirse simple en la UI.
4. **El flujo del colaborador importa**: lo que el admin asigna debe llegar
   claro y accionable a quien lo ejecuta.
5. **Privacidad por defecto**: minimización, sin PII en logs, consentimiento y
   validación en todo input.

## Accessibility & Inclusion

- Estándar declarado del proyecto: **WCAG 2.1 AA**, mobile-first y preparado
  para i18n (aunque español sea el idioma actual).
