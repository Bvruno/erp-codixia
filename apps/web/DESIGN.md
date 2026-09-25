---
name: ERP Codixia
description: Panel SaaS multiempresa dark-first: grafito azulado, acento violeta, densidad compacta.
colors:
  primary: "oklch(0.526 0.247 293)"
  primary-foreground: "oklch(0.985 0 0)"
  primary-hover: "oklch(0.6 0.22 293)"
  primary-soft: "oklch(0.526 0.247 293 / 0.12)"
  primary-soft-2: "oklch(0.526 0.247 293 / 0.2)"
  primary-rose: "oklch(0.645 0.22 16)"
  primary-emerald: "oklch(0.62 0.16 162)"
  primary-cobalt: "oklch(0.585 0.2 254)"
  primary-amber: "oklch(0.745 0.16 65)"
  background: "oklch(0.13 0.01 260)"
  foreground: "oklch(0.985 0 0)"
  card: "oklch(0.18 0.01 260)"
  card-2: "oklch(0.205 0.01 260)"
  popover: "oklch(0.18 0.01 260)"
  secondary: "oklch(0.22 0.01 260)"
  secondary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.22 0.01 260)"
  muted-foreground: "oklch(0.65 0.01 260)"
  border: "oklch(0.28 0.01 260)"
  input: "oklch(0.28 0.01 260)"
  destructive: "oklch(0.577 0.245 27.325)"
  sidebar: "oklch(0.16 0.01 260)"
  sidebar-foreground: "oklch(0.985 0 0)"
  sidebar-accent: "oklch(0.22 0.01 260)"
  sidebar-border: "oklch(0.28 0.01 260)"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.1em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 12px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  badge-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    typography: "{typography.label}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.sidebar-foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "transparent"
    textColor: "{colors.sidebar-foreground}"
  dialog:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: ERP Codixia

## Overview

**Creative North Star: "La Mesa de Trabajo"**

Un banco de trabajo ordenado: el contenido manda y el chrome desaparece. La
interfaz es una herramienta de trabajo B2B para dueños de PyME que coordinan
proyectos, tareas, documentos y turnos; cada píxel o sirve al dato o estorba.
Nada de adornos: ni gradientes decorativos, ni glassmorphism, ni neumorfismo.
La jerarquía nace de superficies apiladas en gris-azulado (hue 260) y de un
único acento violeta por pantalla, no de la decoración.

Dark-first: el modo oscuro es el lienzo base y el claro es un re-mapeo de
superficies y ramp de texto. La densidad es una decisión de primera clase: los
controles miden 36px, las tablas aprietan a 40px, y el modo compacto reduce
padding de cards, cabeceras y celdas sin colapsar la legibilidad. El resultado
es sobrio, confiable y ligeramente técnico; la marca (la gata de Codixia) vive
en un detalle: el cuadro violeta del wordmark.

**Key Characteristics:**

- Dark-first con modo claro completo (`html[data-mode='light']`).
- Superficies en capas de grafito azulado (hue 260), sin negro puro.
- Un acento dominante por pantalla; el resto en escala de grises.
- Precisos y contenidos: controles de 36px, radios de 8/10/14px.
- Ultra compacto: densidad compacta en cards, tablas y navegación.
- Sombras negras suaves de baja opacidad; bordes hairline de 1px.
- Foco visible obligatorio y alturas táctiles de 44px en puntero coarse.
- Sin gradientes decorativos ni glassmorphism (blur solo en barras flotantes).

## Colors

Paleta de grafito azulado (hue 260) con un violeta saturado como única voz de
marca; el modo claro invierte el ramp de superficies manteniendo el mismo
acento.

### Primary

- **Violeta eléctrico** (`--primary`, oklch(0.526 0.247 293)): CTA primario,
  foco, ítem activo de navegación, links y menciones. Es el único color que
  reclama atención.
- **Violeta hover** (`--primary-hover`, oklch(0.6 0.22 293)): estado hover del
  acento. No existe un "active" decorativo aparte; el feedback es de superficie.
- **Tintes de acento** (`--primary-soft` 12%, `--primary-soft-2` 20%): fondos
  de badges suaves, selección de texto, iconos de estados vacíos. Siempre por
  token, nunca por opacidad arbitraria.

### Secondary

- **Variantes de acento** (`html[data-theme='…']`): rose oklch(0.645 0.22 16),
  emerald oklch(0.62 0.16 162), cobalt oklch(0.585 0.2 254) y amber
  oklch(0.745 0.16 65), además de violet (default). Con emerald y amber el texto
  sobre acento es oscuro (`--primary-foreground` oklch(0.16 0.02 162) /
  oklch(0.18 0.03 65)). Son variantes de tema ya definidas en CSS; no hay
  selector de acento en la UI.
- **Destructivo** (`--destructive`, oklch(0.577 0.245 27.325)): acciones
  irreversibles y validación inválida. Mismo valor en ambos modos.
- **Éxito** (`--success`): estados completados, publicados, guardados o al
  día. Dark oklch(0.62 0.16 162) con texto oscuro
  (`--success-foreground` oklch(0.16 0.02 162)); light oklch(0.48 0.14 162)
  con texto claro. Tintes con `bg-success/15`.
- **Precaución** (`--warning`): atención, pendientes de revisión, cierres y
  avisos. Dark oklch(0.745 0.16 65) con texto oscuro; light
  oklch(0.5 0.13 65) con texto claro. Tintes con `bg-warning/15`.
- **Información** (`--info`): estados neutros informativos (programado, en
  curso) y contexto. Dark oklch(0.65 0.19 254) con texto oscuro; light
  oklch(0.48 0.18 254) con texto claro. Tintes con `bg-info/15`. Cada modo
  re-bindea los seis tokens para mantener AA en texto de 12px sobre tinte.

### Neutral

- **Lienzo** (`--background`): dark oklch(0.13 0.01 260); light
  oklch(0.99 0.002 260). Nunca negro ni blanco puro.
- **Superficie** (`--card`): dark oklch(0.18 0.01 260); light oklch(1 0 0).
  `--card-2` (dark oklch(0.205 0.01 260); light oklch(0.985 0.002 260)) es la
  superficie de hover e inputs dentro de cards.
- **Popover** (`--popover`): mismos valores que `--card`; dropdowns, tooltips y
  diálogos.
- **Secundaria / muted** (`--secondary`, `--muted`): dark oklch(0.22 0.01 260);
  light oklch(0.967 0.003 260). Relleno de tabs, badges neutrales y bloques de
  código.
- **Texto** (`--foreground`): dark oklch(0.985 0 0); light oklch(0.21 0.01 260).
- **Texto secundario** (`--muted-foreground`): dark oklch(0.65 0.01 260); light
  oklch(0.52 0.015 260). Descripciones, eyebrows, placeholders.
- **Bordes** (`--border`, `--input`): dark oklch(0.28 0.01 260); light
  oklch(0.922 0.004 260). Hairline de 1px, nunca gruesos.
- **Sidebar** (`--sidebar`): dark oklch(0.16 0.01 260); light
  oklch(0.985 0.002 260), con `--sidebar-border`, `--sidebar-accent` y
  `--sidebar-foreground` propios.

Con alto contraste (`html.high-contrast`) se refuerzan `--muted-foreground`,
`--border`, `--input`, `--secondary` y las superficies de card/sidebar; no se
cambia el acento.

### Named Rules

**The One Voice Rule.** El acento ocupa ≤10% de la pantalla y hay un solo
elemento dominante por vista (CTA primario, ítem activo de nav o foco). Su
rareza es el punto.

**The No-Pure Rule.** Nunca negro puro ni blanco puro de fondo: el lienzo parte
de oklch(0.13) y oklch(0.99).

**The Soft Tint Rule.** Los tintes de acento se construyen solo con
`--primary-soft` (12%) y `--primary-soft-2` (20%); los estados semánticos
(`--destructive`) ocupan <5% de los píxeles.

## Typography

**Display Font:** system-ui (`-apple-system`, Segoe UI, Roboto, Helvetica Neue,
Arial, sans-serif)
**Body Font:** el mismo stack system-ui
**Label/Mono Font:** ui-monospace (Cascadia Code, Segoe UI Mono, Consolas,
Courier New)

**Character:** una sola voz tipográfica de sistema, sin webfonts. La jerarquía
se construye con peso, tamaño y tracking — los títulos aprietan (-0.02em) y las
eyebrows espacian (0.1em) — no con familias distintas. La mono aparece solo
para código, atajos y cifras tabulares alineadas.

### Hierarchy

- **Display** (700, 1.5rem/24px, line-height 1.2, tracking -0.02em): títulos de
  página (`font-display text-2xl font-bold tracking-tight`) y cifras KPI.
- **Title** (600, 1rem, line-height 1.3): títulos de card, diálogo y sección.
- **Body** (400, 0.875rem, line-height 1.5): texto de tablas, paneles y
  formularios; 1rem en inputs en mobile, 0.875rem desde `md`.
- **Label** (600, 0.75rem, tracking 0.1em, uppercase): eyebrows de sección,
  tags y encabezados de grupo de navegación. Sentence case en todo lo demás;
  uppercase solo aquí y en la tagline de marca.

### Named Rules

**The One Stack Rule.** No se introducen familias nuevas: display, body y UI
comparten el stack system-ui; la mono queda reservada a código, atajos y datos
tabulares.

## Layout

Shell de dashboard a pantalla completa (`h-dvh`) sin scroll de página: sidebar
fija a la izquierda + `<main>` con scroll propio. La sidebar mide 16rem (`w-64`)
y colapsa a 3.5rem (`w-14`) con animación de ancho de 200ms; su cabecera mide
4rem expandida y 3.5rem colapsada. Bajo `md` (768px) la sidebar se convierte en
drawer (`sheet`) y aparece un header móvil de 3.5rem. El contenido es fluido:
grillas responsivas y tablas con scroll horizontal dentro de su contenedor,
nunca scroll horizontal de página.

Ritmo vertical en pasos de 4px (Tailwind): 1rem/1.5rem dentro de componentes,
1.5rem (`gap-6`/`space-y-6`) entre bloques de una vista, 2–3rem entre secciones.
La densidad es un ajuste de usuario:

- **Normal:** card con padding 24px y gap 24px; cabecera de tabla 40px; celdas
  8px; ítems de nav 8px 12px.
- **Compacta** (`html[data-density='compact']`): card a 16px, cabecera de tabla
  a 36px, celdas a 6px 8px y nav a 6px 12px.

La página entra con `fade-in-up` de 350ms; en impresión el shell fluye completo
y el chrome se oculta.

## Elevation & Depth

Sistema híbrido: la profundidad nace primero del contraste de superficies
(lienzo → card → card-2) y se refuerza con tres sombras negras suaves de baja
opacidad — nunca duras, nunca de color. La capa flotante más alta (popover)
solo aparece sobre overlay negro al 50%.

### Shadow Vocabulary

- **Card** (`--shadow-card-color`, dark `0 1px 2px rgb(0 0 0 / 0.3), 0 2px 10px rgb(0 0 0 / 0.22)`; light `0 1px 2px rgb(17 17 26 / 0.04), 0 1px 3px rgb(17 17 26 / 0.05)`): cards, paneles y el cuadro de marca.
- **Raised** (`--shadow-raised-color`, dark `0 2px 4px rgb(0 0 0 / 0.35), 0 12px 28px -6px rgb(0 0 0 / 0.45)`; light `0 2px 4px rgb(17 17 26 / 0.06), 0 12px 28px -6px rgb(17 17 26 / 0.12)`): drag ghost, barras flotantes y elementos agarrados.
- **Popover** (`--shadow-popover-color`, dark `0 4px 14px -2px rgb(0 0 0 / 0.4), 0 14px 36px -6px rgb(0 0 0 / 0.35)`; light `0 4px 14px -2px rgb(17 17 26 / 0.1), 0 14px 36px -6px rgb(17 17 26 / 0.14)`): dropdowns, menús, selector de menciones y diálogos.

El único `backdrop-blur` permitido es el de barras flotantes sobre contenido
(toolbars del mapa mental, barra de guardado sticky), siempre acompañado de
`bg-popover/95` o similar y `shadow-raised`. Nada de glassmorphism decorativo,
neumorfismo ni sombras de color.

### Named Rules

**The Layered Gray Rule.** La elevación se comunica con superficies apiladas;
si una jerarquía se puede resolver con `--card` vs `--card-2`, no se agrega una
sombra nueva.

**The Fine Shadow Rule.** Solo existen tres sombras; se elige por capa, no por
gusto. Cualquier sombra nueva debe reemplazar a una, no sumarse.

## Shapes

Formas suaves y contenidas. La escala nace de `--radius` (0.625rem/10px) y se
usa con disciplina: 6px (`sm`, derivados), **8px (`md`) en todo control**
(botones, inputs, badges, tabs), **10px (`lg`) en ítems de navegación y
diálogos**, **14px (`xl`) en cards, menús y el cuadro de marca**, 18px (`2xl`)
en el icono de estados vacíos. La píldora (`rounded-full`) queda reservada a
chips de mención, avatares, dots de estado y al indicador de 3px del ítem de
navegación activo; nunca en cards ni botones.

Los bordes son hairline de 1px (`--border`), a veces sustituidos por rings
(`ring-1 ring-primary/10`, `ring-black/5`) cuando un borde alteraría el layout.
La silueta de marca es la gata de Codixia: SVG blanco con manchas oscura y
naranja sobre cuadro violeta redondeado.

## Components

### Buttons

- **Shape:** contenidos: radio 8px (`rounded-md`), altura 36px (`h-9`), padding
  `0 16px`, gap 8px, texto 14px/500.
- **Primary:** fondo `--primary`, texto `--primary-foreground`, `shadow-xs`;
  hover `--primary-hover`.
- **Secondary / Outline / Ghost:** secondary = `--secondary` con
  `--secondary-foreground`; outline = borde `--border` sobre
  `--background`/`--input` translúcido en dark, hover `--accent`; ghost = sin
  fondo, hover `--accent` (superficie, no borde).
- **Destructive:** fondo `--destructive`, texto blanco, hover al 90%.
- **Disabled:** opacidad 50% y sin eventos de puntero.
- **Hover / Focus:** transición `transition-all` (150ms por defecto); foco
  visible con borde `--ring` + anillo de 3px `--ring/50`; inválido con anillo y
  borde `--destructive`.
- **Sizes:** `sm` 32px, `default` 36px, `lg` 40px, `icon` 36×36; con puntero
  coarse todos suben a ≥40–44px (`pointer-coarse:`).

### Badges / Chips

- **Style:** `--text-xs`/500, radio 8px, padding `0 8px`, borde transparente.
- **Variants:** primary (acento), secondary (`--secondary`), destructive
  (`--destructive`), outline (borde `--border`).
- **Signature:** las menciones del editor son píldoras con borde y fondo
  derivados del acento al 12–35% y color de texto del token
  (`--primary`); por tipo usan colores literales observados (lista
  `#6366f1`, tarea `#b45309`, documento `#047857`, mapa `#7c3aed`, todo
  `#0369a1`). Al imprimir, las menciones pierden fondo y color.

### Cards / Containers

- **Corner Style:** 14px (`--radius-xl`), borde 1px `--border`.
- **Background:** `--card`; el hover interno y los inputs usan `--card-2`.
- **Shadow Strategy:** `--shadow-card-color`, siempre (ver Elevation).
- **Internal Padding:** 24px; 16px en densidad compacta. Título 600 y
  descripción `--muted-foreground` 14px. Sin anidar más de dos niveles de cards.

### Inputs / Fields

- **Style:** altura 36px, radio 8px, borde `--input`, fondo transparente (en
  dark, `--input` al 30% de mezcla), texto 14px desde `md`.
- **Focus:** borde `--ring` + anillo de 3px `--ring/50`; la transición anima
  color y box-shadow.
- **Error:** `aria-invalid` pinta borde y anillo `--destructive`.
- **Disabled:** opacidad 50%, cursor bloqueado.

### Form Controls (Select, Checkbox, Textarea, Calendar)

- **Select:** trigger idéntico a un input: 36px (32px en `sm`), radio 8px,
  borde `--input`, fondo `--input` al 30% en dark, `shadow-xs`; menú
  `--popover` con radio 8px, borde 1px, `shadow-md` e ítems de 4px de radio
  (`focus:bg-accent`). Separadores de 1px `--border`.
- **Checkbox:** caja de 16px (`size-4`), radio 4px, borde `--input`; marcado
  `--primary` con check de 14px; foco con anillo de 3px; deshabilitado al 50%.
- **Textarea:** misma receta que el input, `min-height` ~96px y resize
  vertical.
- **Label:** 14px/500 en `--foreground`, siempre visible; el placeholder nunca
  sustituye al label.
- **Calendar / TimePicker:** celdas de 32px (`size-8`) con radio 8px, hover y
  "hoy" en `--accent`, selección en `--primary`; weekdays en
  `--muted-foreground` a 12.8px. El time picker usa trigger mono con icono de
  reloj y un popover `p-2` con columnas de hora/minuto en mono, 12rem de alto
  e ítem activo `--primary`.

### Navigation

Sidebar `--sidebar` con borde derecho `--sidebar-border`; ítems de 10px de
radio, padding `8px 12px`, icono de 16px + label 14px. El ítem activo va en
`--sidebar-foreground` con peso 600 y una barra de 3px redondeada en
`--primary` a la izquierda; el inactivo al 75% con hover `--sidebar-accent`.
Los grupos se rotulan con eyebrow de 12px/600/0.1em al 50%. En móvil se replica
dentro del drawer (`sheet`) y el header móvil mide 56px con borde inferior.

### Tabs

Lista en `--muted` con radio 10px y padding 3px; trigger de 8px de radio, texto
14px/500, activo sobre `--background` con `shadow-sm`; foco con anillo de 3px.
La lista hace scroll horizontal si no cabe.

### Tables

Texto 14px; cabecera de 40px (36px en compacta) con borde inferior
(`--border`) y peso 500; filas con borde inferior, hover `--muted/50` y última
fila sin borde; celdas con padding 8px (6px 8px en compacta). Las cifras usan
`tabular-nums`; el contenedor hace scroll horizontal.

### Dialog / Sheet

Diálogos centrados con overlay `black/50`, fondo `--background`, radio 10px,
padding 24px, `shadow-lg`, ancho máximo `lg` (32rem) y cierre con botón de 36px
en la esquina. El drawer móvil reutiliza la sidebar completa.

### Menus, Popovers & Tooltips

- **Dropdown / Popover:** superficie `--popover` con borde 1px y radio 8px;
  menús con padding 4px (`p-1`) y `shadow-md`, popovers libres con `w-72` y
  `p-4`. Ítems de 4px de radio con `focus:bg-accent` y
  `focus:text-accent-foreground`; los destructivos usan `--destructive` con
  fondo al 10%.
- **Tooltip:** fondo `--foreground` y texto `--background`, radio 8px,
  padding `6px 12px`, 12px, con flecha de 10px rotada. Solo aclara iconos o
  atajos; nunca contiene acciones.
- **Posicionamiento:** Radix con origen en el trigger y animaciones de
  fade/zoom de 150ms. El selector de menciones del editor usa la sombra de
  capa popover completa.

### Confirm Dialog (destructive)

Confirmaciones destructivas sobre `DialogContent` con ancho `sm:max-w-md`
(28rem): icono en círculo de 36px (`rounded-full p-2`) con fondo
`--destructive` al 10% (o `--primary` al 10% en variante default), título y
descripción; para acciones irreversibles se exige escribir un texto exacto
antes de habilitar el botón principal. Acciones: Cancelar en `outline` +
principal en `destructive`/`default`; nunca un solo botón.

### Empty States & Skeletons

Estados vacíos centrados con icono en cuadro `--primary-soft` de 18px de radio
y `shadow-card`, título 18px/600, descripción `--muted-foreground` y acción
outline `sm`. La carga nunca usa spinner de pantalla completa: `Skeleton` con
`shimmer` de 1.5s sobre `--muted`, con variantes de tabla, cards y kanban.

### Floating Bars (signature)

- **Barra de guardado** (`EstadoGuardado`): sticky a `bottom-4` y alineada a
  la derecha, radio 14px, borde 1px, fondo `--background/85`, padding 12px,
  texto 14px, `shadow-lg` + `backdrop-blur`. Estados con icono: `Loader2`
  girando, `Check` o `AlertCircle` en `--destructive`.
- **Toolbars del mapa mental** (`barra-herramientas`, `barra-seleccion`):
  centradas abajo (`bottom-4` / `bottom-16`), `bg-popover/95`, radio 14px,
  padding 4–6px, `shadow-lg` + `backdrop-blur`, separadores verticales de 1px
  `--border`; botones de 32px con radio 8px, hover `--muted` y activo
  `--primary` al 10%.
- Es el único uso permitido de `backdrop-blur`; siempre con fondo al 85–95% y
  sombra elevada, nunca glassmorphism decorativo.

### Avatar

Avatar circular de 32px (`size-8`) con imagen fluida; fallback en `--muted`
con iniciales a 12px (en el menú de usuario de la sidebar usa
`--sidebar-primary` con texto invertido). Aparece en el menú de usuario y en
listas de colaboradores; sin borde ni sombra propios.

### Brand (signature)

Cuadro violeta (`bg-primary`, radio 14px, `shadow-card`, ring sutil) con la
gata de Codixia; al lado el wordmark "ERP Codixia" en 15px/700/tracking-tight y
la tagline "PLATAFORMA" en 12px/500/uppercase/0.16em `--muted-foreground`.
Tamaño 36px (32px en `sm`).

### Drag Ghost (signature)

Al arrastrar una tarea, una copia flotante con `drag-ghost-inner`: entra en
300ms con `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot), ligera rotación
(0.5–1.5°) y `shadow-raised`. Es el único gesto con rebote del sistema.

## Do's and Don'ts

### Do:

- **Do** diseñar en oscuro primero y verificar el claro después
  (`html[data-mode='light']`).
- **Do** usar `--primary-soft` (12%) y `--primary-soft-2` (20%) para cualquier
  tinte de acento; nunca opacidades ad hoc.
- **Do** mantener un solo elemento acento dominante por pantalla; el resto en
  grafito (hue 260).
- **Do** respetar los radios: 8px controles, 10px navegación y diálogos, 14px
  cards y menús.
- **Do** construir la jerarquía con superficie (`--card` vs `--card-2`) antes
  de recurrir a una sombra.
- **Do** usar `--font-mono` y `tabular-nums` para cifras alineadas y código.
- **Do** respetar `prefers-reduced-motion` y la clase `html.reduce-motion`
  (anima 0.01ms, sin excepciones).
- **Do** garantizar foco visible (`--ring` + anillo 3px) y áreas táctiles de
  44px en puntero coarse.
- **Do** escribir la UI en sentence case; uppercase solo en eyebrows y tagline.

### Don't:

- **Don't** introducir negro (`#000`) ni blanco puro como fondo: el lienzo
  parte de oklch(0.13) y oklch(0.99).
- **Don't** usar gradientes decorativos, glassmorphism ni neumorfismo; el único
  blur permitido es el de barras flotantes sobre contenido.
- **Don't** inventar sombras duras ni de color: solo las tres sombras negras
  suaves del sistema.
- **Don't** usar `rounded-full` en cards ni botones; la píldora es solo para
  chips, avatares, dots y el indicador de nav activo.
- **Don't** agregar familias tipográficas, webfonts ni más de tres tamaños
  tipográficos por pantalla.
- **Don't** anidar más de dos niveles de cards.
- **Don't** romper la densidad compacta con paddings fijos; usar los tokens y
  dejar que `html[data-density='compact']` apriete card, tabla y nav.
- **Don't** usar spinners de pantalla completa: usar skeletons con shimmer.
- **Don't** duplicar lógica de permisos o negocio en UI: el panel es un cliente
  delgado de la API.
