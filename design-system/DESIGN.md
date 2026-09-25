# ERP Codixia

> Category: Application
> Panel SaaS multi-empresa (tareas, documentos, mapas mentales, calendario y
> colaboradores). Dark-first, denso en datos, con modo claro, cinco acentos,
> alto contraste y densidad compacta. Derivado directamente de los tokens de
> `apps/web/src/estilos/globals.css` (Tailwind v4 + shadcn `base-nova`).

## Visual Theme & Atmosphere

Calmado, funcional, denso. La interfaz es una herramienta de trabajo: el
contenido manda, el chrome desaparece. Superficies en capas de gris-azulado
(hue 260), acento único por pantalla, sombras suaves de bajo contraste y
bordes hairline. Nada de adornos, gradientes decorativos ni glassmorphism.

- **Personalidad:** producto B2B, sobrio, confiable, ligeramente técnico.
- **Modo por defecto:** oscuro (`:root`). El claro es `[data-mode='light']`.
- **Acento por defecto:** violeta. Alternativas: rose, emerald, cobalt, amber.
- **Marca:** marca de gata (mish) sobre cuadro `--accent` con radio `--radius-xl`,
  wordmark "ERP Codixia" en `--font-display` bold y tagline "PLATAFORMA" en
  `--text-xs` uppercase con `--tracking-wordmark`.

## Color Palette & Roles

Dark es el modo base; light solo re-mapea superficies y ramp de texto.

| Rol | Token | Dark (default) | Light |
| --- | --- | --- | --- |
| Fondo app | `--bg` | `oklch(0.13 0.01 260)` | `oklch(0.99 0.002 260)` |
| Superficie (cards, modales) | `--surface` | `oklch(0.18 0.01 260)` | `oklch(1 0 0)` |
| Superficie 2 (hover, inputs) | `--surface-warm` | `oklch(0.205 0.01 260)` | `oklch(0.985 0.002 260)` |
| Sidebar | `--sidebar-bg` | `oklch(0.16 0.01 260)` | `oklch(0.985 0.002 260)` |
| Texto | `--fg` | `oklch(0.985 0 0)` | `oklch(0.21 0.01 260)` |
| Texto secundario | `--muted` | `oklch(0.65 0.01 260)` | `oklch(0.52 0.015 260)` |
| Borde | `--border` | `oklch(0.28 0.01 260)` | `oklch(0.922 0.004 260)` |
| Acento | `--accent` | violeta `oklch(0.526 0.247 293)` | idem |
| Acento hover | `--accent-hover` | `oklch(0.6 0.22 293)` | idem |
| Acento activo | `--accent-active` | `color-mix(accent, black 14%)` | idem |
| Éxito | `--success` | `oklch(0.62 0.16 162)` | `oklch(0.48 0.14 162)` |
| Precaución | `--warn` | `oklch(0.745 0.16 65)` | `oklch(0.5 0.13 65)` |
| Información | `--info` | `oklch(0.65 0.19 254)` | `oklch(0.48 0.18 254)` |
| Peligro | `--danger` | `oklch(0.577 0.245 27.325)` | idem |

Los tokens semánticos re-bindean por modo (con su `*-foreground`) para
mantener AA en texto de 12px sobre tinte `bg-*/15`.

**Accent themes** (`[data-accent='…']` en `<html>`): violet (default),
rose `oklch(0.645 0.22 16)`, emerald `oklch(0.62 0.16 162)`,
cobalt `oklch(0.585 0.2 254)`, amber `oklch(0.745 0.16 65)`.
Con amber y emerald el texto sobre acento es oscuro (`--accent-on`).

Reglas:

- Nunca negro puro ni blanco puro de fondo.
- Un solo elemento acento dominante por pantalla (CTA primario, ítem activo
  de nav, foco). Los estados semánticos ocupan <5% de los píxeles.
- Tintes de acento solo vía `--accent-soft` (12%) y `--accent-soft-2` (20%).

## Typography Rules

- **Display / headings:** `--font-display` (system-ui stack), weight 600–700,
  `letter-spacing: --tracking-display` (-0.02em), `text-wrap: balance`.
- **Body:** `--font-body` (mismo stack), weight 400.
- **Mono:** `--font-mono` (Cascadia Code / Consolas) para código, atajos y
  datos tabulares.
- Escala (px): `--text-xs` 12 · `--text-sm` 14 · `--text-base` 16 ·
  `--text-lg` 20 · `--text-xl` 24 · `--text-2xl` 32 · `--text-3xl` 48 ·
  `--text-4xl` 64.
- Line-height: `--leading-body` 1.5 en texto corrido, `--leading-tight` 1.25
  en títulos.
- Etiquetas de sección / eyebrows: `--text-xs`, uppercase, weight 600,
  `letter-spacing: --tracking-eyebrow` (0.1em), color `--muted`.

## Component Stylings

Todos los controles usan `--radius-md` (8px) y transición
`--motion-fast` + `--ease-standard`. La altura base es `--control-h` (36px);
`--control-h-sm` (32px) y `--control-h-lg` (40px). En puntero coarse todo
control táctil mide al menos `--tap-target-min` (44px).

- **Buttons:** `data-slot="button"`. Primary = fondo `--accent`, texto
  `--accent-on`, hover `--accent-hover`, activo `--accent-active`.
  Secondary = fondo `--surface-warm`. Outline = borde `--border`, fondo
  transparente. Ghost = sin fondo, hover `--surface-warm`. Destructive =
  fondo `--danger`, texto claro. Link = texto `--accent` con subrayado al
  hover. Foco: `box-shadow: --focus-ring` + borde `--accent`.
- **Inputs / textarea / select:** alto `--control-h`, borde `--border`,
  fondo `color-mix(--border, transparent 70%)` en dark, `--radius-md`,
  placeholder `--muted`, foco con `--focus-ring`. Estado inválido: borde
  `--danger`.
- **Cards:** `data-slot="card"`, fondo `--surface`, borde `--border`,
  `--radius-xl` (14px), padding 24px, `gap` 24px, `box-shadow: --elev-card`.
  Header con título 600 y descripción `--muted` `--text-sm`; footer con
  borde superior si aplica. Densidad compacta reduce padding a 16px.
- **Badges:** `--text-xs` weight 500, `--radius-md`, padding `0 8px`; primary
  (acento), secondary (`--surface-warm`), outline (borde `--border`),
  destructive (`--danger`), success (soft verde). Dot de 6px con
  `--radius-pill` para estados.
- **Tabs:** lista en `--surface-warm` con `--radius-lg` y padding 3px;
  trigger activo con fondo `--bg`, texto `--fg` y `--elev-ring`.
- **Tables:** `--text-sm`; header `--text-sm` weight 500 alto 40px con borde
  inferior; filas con borde inferior `--border`, hover
  `color-mix(--surface-warm, transparent 50%)`; última fila sin borde.
- **Navegación lateral:** sidebar `--sidebar-bg` con borde
  `--sidebar-border`; ítems `--radius-lg`, padding `8px 12px`, icono +
  label `--text-sm`; ítem activo en `--fg` weight 600 con barra de 3px
  `--accent` a la izquierda; labels de grupo en `--text-xs` uppercase
  `--tracking-eyebrow`. Colapsado: 3.5rem (`--sidebar-width-collapsed`).
- **Dialog / popover:** diálogo sobre `--bg` con `--radius-lg` (10px) y
  `--elev-popover`; dropdowns y popovers sobre `--surface` con `--radius-md`
  y `--elev-raised`. El overlay de modal oscurece el fondo con negro al
  50–60%.
- **Menciones y chips:** píldora `--radius-pill`, borde y fondo derivados de
  `--accent`/semántico al 12–35%, texto del color correspondiente.
- **Skeleton:** fondo `--surface-warm` (o `--muted`) con shimmer; nunca
  spinner de pantalla completa.

## Layout Principles

- **Shell dashboard:** sidebar fija (`--sidebar-width` 16rem; colapsable a
  `--sidebar-width-collapsed` 3.5rem) + topbar de `--topbar-height` (4rem)
  + `<main>` con scroll propio. En móvil (<768px) la sidebar se convierte en
  drawer (`sheet`) de 18rem.
- **Contenido:** ancho máximo de lectura `--container-max` (1200px) para
  páginas de marketing/docs; dentro del panel las vistas son fluidas y usan
  grids de 12 columnas con gutters de `--container-gutter-*`.
- **Ritmo vertical:** `--space-6` (24px) entre bloques de una vista,
  `--space-8`/`--space-12` entre secciones; `--section-y-*` solo en páginas
  públicas.
- **Jerarquía:** primero título de página + acciones, luego KPIs/cards, luego
  tabla o lista. No anidar más de dos niveles de cards.
- **Densidad:** `html[data-density='compact']` reduce padding de cards a
  16px, alto de header de tabla a 36px y padding de celdas a `6px 8px`.

## Depth & Elevation

Tres sombras y dos auxiliares, nunca más:

- **Flat (0):** por defecto. `--elev-flat`.
- **Card (1):** cards y paneles — `--elev-card`.
- **Raised (2):** dropdowns, toasts, hovers elevados — `--elev-raised`.
- **Popover (3):** modales y popovers — `--elev-popover`.
- **Ring:** hairline `--elev-ring` cuando un borde de 1px alteraría el layout.

Sin neumorfismo, sin glassmorphism (el único blur permitido es la topbar
sticky sobre contenido, máx. 8px).

## Motion

- `--motion-fast` (150ms) para hover/focus/micro-estados.
- `--motion-base` (200ms) para cambios de estado generales.
- `--motion-slow` (350ms) solo para entrada de página (`fade-in-up 12px`).
- Easing estándar `--ease-standard`; `--ease-overshoot` solo en feedback
  lúdico (drag-ghost).
- `html.reduce-motion` desactiva animaciones y transiciones. Todo artefacto
  debe respetar `prefers-reduced-motion`.

## Accessibility

- Foco visible obligatorio: `--focus-ring` en todo elemento interactivo.
- Contraste mínimo AA (4.5:1 texto normal, 3:1 texto grande y UI).
  `html.high-contrast` refuerza `--muted`, `--border` y superficies.
- Áreas táctiles ≥44px con puntero coarse (`@custom-variant pointer-coarse`).
- No comunicar estado solo por color: acompañar con icono/texto.
- `::selection` usa `--accent-soft`.

## Responsive Behavior

- **Desktop ≥1024px:** sidebar expandida, grids de 12 columnas, tablas
  completas.
- **Tablet 640–1023px:** sidebar colapsada o drawer, gutters 16px, cards en
  2 columnas.
- **Phone <640px:** drawer, una columna, tablas con scroll horizontal
  (`table-container`), Safe areas con `padding-bottom: max(16px,
  env(safe-area-inset-bottom))`.

## Do's and Don'ts

- ✅ Dark-first: diseña en oscuro y verifica el claro después.
- ✅ Un acento dominante por pantalla; el resto en escala de grises.
- ✅ Usa `--surface` para cards y `--bg` para el lienzo: la elevación nace
  del contraste de superficie, no de la sombra.
- ✅ Respeta radios: 8px controles, 10px ítems de nav, 14px cards/modales.
- ✅ Títulos en sentence case; uppercase solo en eyebrows y taglines.
- ❌ No inventar hex/rgb fuera del bloque `:root` de `tokens.css`.
- ❌ No gradientes decorativos, glassmorphism ni neumorfismo.
- ❌ No más de tres tamaños tipográficos por pantalla.
- ❌ No sombras duras ni de color; sombras negras suaves.
- ❌ No usar `--radius-pill` en cards o botones (solo chips/avatares).
- ❌ No duplicar lógica de permisos/negocio en UI: el panel es un cliente
  delgado (ver AGENTS.md).

## Agent Prompt Guide

- Pega el bloque `:root` + modo + acento de `tokens.css` como PRIMER cosa en
  el `<style>`; después referencia solo `var(--token)`.
- Si el brief pide "profesional" o "dashboard", esto ya es ese registro:
  resta, no añadas.
- Reutiliza las recetas de `components.html` (botones, campos, card, tabs,
  tabla, nav, dialog) antes de inventar controles.
- Datos tabulares: `--font-mono` para cifras alineadas; `--text-sm` y filas
  de 40px.
- Al proponer un color nuevo, avisa en un comentario del artefacto y usa el
  token más cercano.
