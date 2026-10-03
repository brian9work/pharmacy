---
name: diseno-docs-sienetworks
description: Sistema de diseño de la página de documentación de Sienetworks MCP (mcp-work.page, proyecto systems/tmp_document, Next.js + Tailwind v4). Úsala siempre que crees o modifiques una página, sección, componente o texto de ese sitio —portada, guía "Vincula tu MCP", blog o páginas nuevas— y cuando revises su UI, experiencia de usuario, accesibilidad, animaciones, tema claro/oscuro, responsive o rendimiento.
---

# Diseño de la documentación de Sienetworks MCP

Sitio informativo para los colaboradores de Sienetworks: explica qué es el MCP,
por qué conviene usarlo y cómo conectarlo a Claude. Estética sobria tipo Apple:
mucho aire, tipografía grande, pocas decoraciones, un color de acento.

**Antes de escribir código**, lee la guía de Next de esta versión en
`node_modules/next/dist/docs/` (lo exige `AGENTS.md`: la versión tiene cambios
incompatibles con lo que se suele saber de Next).

---

## 1. Principios

1. **Una idea por sección.** Cada `<section>` responde una pregunta: qué es,
   por qué, cómo, qué viene. Si una sección necesita dos títulos, son dos.
2. **El contenido manda, el diseño acompaña.** Nada de decoración que no
   explique algo: sin gradientes, sin sombras de adorno, sin iconos de relleno.
3. **Funcional y comercial, no técnico.** Se escribe para quien usa el MCP, no
   para quien lo programa. Beneficio primero; el detalle técnico, solo si el
   usuario lo necesita para actuar.
4. **Honesto.** Nada de cifras no medidas, testimonios inventados ni funciones
   que no existen. Lo que viene se marca "En preparación".
5. **Rápido y estable.** HTML del servidor, el mínimo JavaScript posible, cero
   saltos de layout.

---

## 2. Stack y estructura

- Next.js (App Router) con **Server Components por defecto**. `"use client"`
  solo si hace falta estado, efectos o eventos del navegador, y en el
  componente más pequeño posible.
- Tailwind v4. Los tokens viven en `app/globals.css` (`@theme inline`).
- **El texto va aparte del marcado:** cada página tiene su archivo de contenido
  (`inicio-contenido.ts`, `steps.ts`). Para cambiar un texto no se toca el JSX.
- Componentes en `app/components/`. Nombres en español, como el resto del
  proyecto.
- Sin dependencias nuevas (librerías de animación, iconos, UI) sin preguntar
  antes. Los iconos son SVG en línea o archivos de `public/`.
- Las páginas que se sirven con y sin token comparten un componente
  (`inicio.tsx`, `guia.tsx`): la ruta solo decide el acceso.

---

## 3. Tokens

Nunca un color escrito a mano: siempre el token, para que el tema oscuro funcione solo.

| Token (clase) | Claro | Oscuro | Uso |
|---|---|---|---|
| `bg-background` | `#ffffff` | `#000000` | Fondo de página y de tarjetas sobre `surface` |
| `bg-surface` | `#f5f5f7` | `#161617` | Secciones alternas y tarjetas sobre `background` |
| `text-foreground` | `#1d1d1f` | `#f5f5f7` | Texto principal |
| `text-muted` | `#6e6e73` | `#a1a1a6` | Texto secundario, descripciones, etiquetas |
| `border-hairline` | `#d2d2d7` | `#424245` | Divisores y bordes finos |
| `bg-accent` / `text-accent` | `#0071e3` | `#2997ff` | Botón principal, enlaces, números, lo activo |
| `hover:bg-accent-hover` | `#0077ed` | `#47a5ff` | Hover del botón principal |
| `bg-header` | blanco 72 % | `#161617` 72 % | Barras fijas con desenfoque |

Única excepción: el **recuadro de logos de terceros** va en `bg-white` fijo,
porque esos logos están pensados para fondo claro.

Un token nuevo se añade en los **tres** bloques de `globals.css` (`:root`,
`:root[data-theme="dark"]` y la media query oscura) y en `@theme inline`.

### Tipografía
Fuente del sistema (`--font-sans`, SF Pro en Apple), sin fuentes web.

| Rol | Clases |
|---|---|
| Título de portada (h1) | `text-[2.5rem] min-[400px]:text-5xl sm:text-7xl font-semibold leading-[1.05] tracking-tight` |
| Título de sección (h2) | `text-4xl sm:text-5xl font-semibold leading-[1.1] tracking-tight` |
| Etiqueta sobre el título | `text-xs font-semibold uppercase tracking-wider text-muted` |
| Subtítulo de sección | `text-xl leading-8 text-muted` |
| Título de tarjeta (h3) | `text-xl font-semibold tracking-tight` |
| Texto de cuerpo | `text-[17px] leading-7` (secundario: `+ text-muted`) |
| Texto compacto | `text-[15px] leading-6` |
| Nombres de herramientas y valores copiables | `font-mono text-sm` |

- Jerarquía de encabezados sin saltos: un `h1` por página, `h2` por sección, `h3` dentro.
- Líneas de lectura de 60 a 75 caracteres: `max-w-2xl` o `max-w-3xl` para texto.

### Espaciado, radios y anchos
- Sección: `px-4 py-20 sm:py-24`. Portada: `pt-20 pb-16 sm:pt-32`.
- Entre el encabezado de sección y su contenido: `mt-14`.
- Rejillas: `gap-6`. Listas de tarjetas apiladas: `space-y-4`.
- Radios: tarjeta `rounded-3xl`, bloque interno `rounded-2xl`, botones y chips `rounded-full`.
- Anchos: rejillas `max-w-5xl`, texto y listas `max-w-3xl`, artículo de guía `max-w-[692px]`.
- Sombras: solo en capturas de pantalla (`shadow-[0_8px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5`).

---

## 4. Patrones (usar estos, no inventar variantes)

**Ritmo de fondos.** Las secciones alternan `bg-background` y `bg-surface`.
Las tarjetas usan el fondo contrario al de su sección. Al insertar una sección,
revisa que la alternancia siga y que la última antes del footer quede bien.

**Encabezado de sección** (componente `Encabezado`): etiqueta, h2 y subtítulo
opcional, centrados en `max-w-3xl`.

**Tarjeta**
```tsx
<li className="rounded-3xl bg-surface p-8">
  <h3 className="text-xl font-semibold tracking-tight">{titulo}</h3>
  <p className="mt-3 text-[17px] leading-7 text-muted">{texto}</p>
</li>
```
Rejilla: `mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3`.
Con un número de tarjetas que no cuadra con las columnas, reagrupa o cambia
las columnas: evita una tarjeta sola en la última fila.

**Botón principal** (una acción por pantalla, siempre la misma: vincular el MCP)
```tsx
<Link className="rounded-full bg-accent px-6 py-3 text-[17px] text-white transition-colors hover:bg-accent-hover">
```
**Acción secundaria:** enlace `text-[17px] text-accent hover:underline` con `›` al final.

**Paso numerado:** número `text-accent tabular-nums` con dos dígitos
(`01`, `02`) delante del título, en la misma línea (`flex items-baseline gap-3`).

**Ejemplo de petición:** bloque `rounded-2xl bg-surface px-4 py-3`, con
"Pídele a Claude:" en `text-muted` y el texto entre « ».

**Chip o estado:** `rounded-full bg-surface px-3 py-1 text-xs text-muted`
(por ejemplo "En preparación").

**Logo de terceros:** recuadro `flex h-24 items-center justify-center rounded-2xl bg-white px-6`
con la imagen en `h-12 w-auto object-contain`.

**Tabla:** dentro de una tarjeta con `overflow-x-auto`, `table-fixed`, encabezados
con `scope`, filas con `divide-y divide-hairline`, ✓ en `text-accent` y — en
`text-muted`, cada uno con `aria-label`.

**Preguntas frecuentes:** `<details>` y `<summary>` nativos (funcionan sin
JavaScript y con teclado), un `+` que gira 45° con `group-open:rotate-45`.

**Valor copiable** (correo, URL, ID): `select-all break-all font-mono`.

---

## 5. Experiencia de usuario

- **Orden de la portada:** qué es → por qué → cómo te ayuda → qué puedes hacer
  → reglas de uso → qué viene → confianza (correos, límites, preguntas) → empezar.
  La acción principal aparece arriba y al final.
- **Navegación:** header fijo (marca, enlaces, tema) y, en páginas largas, una
  barra de secciones fija debajo que resalta dónde está el lector. Cada sección
  enlazable lleva `id`, y `scroll-padding-top` en `globals.css` deja sitio a las
  dos barras. Si añades otra barra fija, actualízalo.
- **Escaneable:** títulos que se entienden solos, párrafos de una a tres
  frases, listas en vez de bloques de texto.
- **Mostrar, no contar:** un ejemplo concreto ("Pídele a Claude: …") vale más
  que un adjetivo.
- **Revelar por capas:** lo esencial a la vista; el detalle en `<details>` o en
  la guía.
- **Enlaces:** los internos conservan el token si la URL lo trae (`TokenLink`).
  Los externos se dicen como externos y nunca llevan datos en la URL.
- **Confianza:** remitente oficial de los correos, dominio oficial, qué se hace
  con la información. Siempre visibles, nunca en letra pequeña.
- **Estados:** una página protegida sin acceso redirige; no mostrar páginas a medias.

---

## 6. Texto

- Español, tuteo, frases cortas, voz activa.
- Beneficio antes que función: "Resuelve dudas en segundos", no "Endpoint de consulta semántica".
- Sin jerga: nada de "indexar", "fragmentos", "embeddings", "endpoint" o
  "webhook" en texto para usuarios. Los nombres de herramientas solo en la
  sección de herramientas, en `font-mono`.
- Términos fijos: **agente** (nunca "proyecto"), **Claude**, **Sienetworks MCP**,
  roles **user / creator / admin**.
- Fechas: "30 de septiembre de 2026", escritas en el contenido, sin calcularlas
  con la zona horaria del servidor.
- Antes de afirmar algo sobre privacidad, seguridad o datos, confírmalo con el
  dueño del producto.

---

## 7. Tema claro y oscuro

- El tema lo decide `data-theme` en `<html>` (botón del header, guardado en
  `localStorage` con la clave `tema`); sin elección, la preferencia del sistema.
- La variante `dark:` de Tailwind sigue esa misma regla (`@custom-variant` en `globals.css`).
- Un script en línea en `<head>` aplica el tema guardado antes de pintar: no lo
  quites ni lo muevas a un componente de cliente, o la página parpadea.
- Lo que dependa del tema en el render inicial se resuelve con CSS (`dark:hidden`),
  no con estado de React, para no romper la hidratación.
- **Revisa todo cambio en los dos temas:** contraste, logos (`dark:invert` para
  los monocromos) y bordes.

---

## 8. Responsive

- Mobile first: se diseña para 360 px y se amplía con `sm:` (640), `md:` (768) y `lg:` (1024).
- **Nunca scroll horizontal de la página.** Lo que no quepa (tablas, barras de
  navegación) se desplaza dentro de su contenedor con `overflow-x-auto`.
- Margen lateral: `px-4` en móvil.
- Rejillas: 1 columna en móvil, 2 en `sm`, 3 o 4 en `lg`.
- Ajustes finos con `min-[400px]:` cuando algo no cabe en 320–400 px (título de
  portada, texto de tabla, etiqueta del header).
- Cuidado con `text-nowrap`: comprueba el texto más largo en la columna más
  estrecha antes de usarlo.
- Áreas táctiles de al menos 40×40 px en botones de solo icono.
- Comprueba en 320, 375, 768, 1024 y 1440 px.

---

## 9. Animaciones

Sutiles y con propósito: confirman una acción o guían la vista; nunca decoran.

- Solo `transform` y `opacity` (y colores en hover). Nunca animar `width`,
  `height`, `top` o `margin`: provoca saltos y trabajo de layout.
- Duraciones: hover y foco 150 ms (`transition-colors`); desplegables 200–250 ms;
  entradas 300–400 ms. Curva `ease-out` al entrar, `ease-in` al salir.
- Solo CSS (transiciones de Tailwind, `@starting-style` con la variante
  `starting:`). Sin librerías de animación.
- **Respeta `prefers-reduced-motion`:** las animaciones de movimiento van con
  `motion-safe:`, y el scroll suave se desactiva con `motion-reduce`.
- Nada de animaciones al cargar que retrasen ver el contenido, ni bucles infinitos.

Entrada suave de un elemento:
```tsx
<div className="transition duration-300 ease-out starting:opacity-0 motion-safe:starting:translate-y-2">
```

Aparición al hacer scroll, si se pide: un solo `IntersectionObserver` en un
componente de cliente pequeño que añade una clase. El contenido es visible por
defecto, sin JavaScript, y solo se oculta para animarlo cuando el script ya cargó.

---

## 10. Accesibilidad

- HTML semántico: `header`, `nav` con `aria-label`, `main`, `section` con `id`, `footer`, listas reales.
- Todo `<Image>` con `alt` descriptivo; las imágenes decorativas, `alt=""` o `aria-hidden`.
- Iconos SVG decorativos con `aria-hidden="true"`; botones de solo icono con `aria-label`.
- **Foco visible siempre.** No quites el contorno; en elementos personalizados:
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`.
- Contraste mínimo AA (4.5:1 para texto normal) en los dos temas. `text-muted`
  solo para texto secundario, nunca para lo imprescindible.
- Todo se puede hacer con teclado: Tab llega a cada enlace y botón en orden lógico.
- Elemento activo de la navegación con `aria-current`.
- `lang="es"` en `<html>`.

---

## 11. Rendimiento

Objetivo: Lighthouse 95+ en Rendimiento, Accesibilidad y Buenas prácticas, en móvil.

- **Server Components** para todo lo estático; el JavaScript del cliente se
  limita al botón de tema y a la navegación de secciones.
- **Imágenes:** siempre `next/image` con `width` y `height` reales (cero saltos
  de layout). WebP para fotos y capturas, SVG para logos e iconos. `preload`
  solo en la imagen principal de la portada; el resto, carga diferida (lo hace
  `next/image`). `sizes` en las imágenes anchas.
- **Fuentes:** las del sistema, sin descargar ninguna.
- **CSS:** solo Tailwind y `globals.css`; nada de CSS por componente salvo que haga falta.
- **Sin terceros:** ni analítica, ni chats, ni scripts externos sin aprobación.
- **Medir:** `next build` (revisa el tamaño de cada ruta) y Lighthouse en modo
  móvil antes y después de un cambio grande.
- **Métricas:** LCP < 2,5 s, CLS < 0,1, INP < 200 ms.

---

## 12. Seguridad y privacidad del sitio

- El token de acceso viaja en la URL: `referrer: "no-referrer"` en el layout
  (no lo quites) y nunca enlaces externos que copien la URL actual.
- `robots: { index: false }`: el sitio no se indexa.
- Ningún secreto en el código ni en los archivos de contenido.

---

## 13. Lista de comprobación antes de terminar

- [ ] Textos en el archivo de contenido, no en el JSX.
- [ ] Solo tokens de color; revisado en tema claro y oscuro.
- [ ] Sin scroll horizontal en 320 px; probado en móvil y escritorio.
- [ ] Encabezados en orden, `alt` en las imágenes, foco visible, todo navegable con teclado.
- [ ] La alternancia de fondos sigue correcta y la sección nueva tiene `id` y está en la navegación.
- [ ] Animaciones solo con `transform` y `opacity`, y respetan `prefers-reduced-motion`.
- [ ] `next/image` con dimensiones; sin dependencias ni scripts nuevos.
- [ ] Texto funcional, sin jerga, sin cifras inventadas ni promesas de lo que no existe.
- [ ] `pnpm lint` sin errores.

## 14. Lo que no se hace

- Colores, sombras o radios fuera de los tokens y patrones de arriba.
- Gradientes, glassmorphism fuera de las barras fijas, emojis decorativos.
- Más de un botón principal compitiendo en la misma pantalla.
- Texto dentro de imágenes.
- Carruseles, ventanas emergentes al cargar o vídeo en reproducción automática.
- Ocultar contenido importante tras una interacción que no se nota.
- `"use client"` en una página entera para un solo botón.
