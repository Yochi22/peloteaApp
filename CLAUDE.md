# CLAUDE.md — Plataforma de reservas de canchas

> Archivo raíz de contexto para Claude Code. Contiene la visión, el dominio, la
> arquitectura y las convenciones del proyecto. Mantener actualizado en cada
> cambio estructural.

Nombre provisional: **Pelotea** / **CanchaYa** (por definir).
Fecha de arranque: 2026-09-10.

---

## 1. Visión

Software web para complejos deportivos (tenis, pádel, beach tennis, vóley de
playa, fútbol, etc.) que están proliferando en Venezuela. Cuatro productos
conectados:

| Módulo | Qué resuelve | Rol de negocio |
|---|---|---|
| **Motor de reservas** | Reservar como en el cine: disponibilidad, slot, pago | Lo que compran los dueños |
| **Recuperación de ingresos** | No-shows, cancelaciones, horas muertas → ofertas exprés y last-minute | Diferenciador |
| **Social / matchmaking** | Unir jugadores sueltos con partidos abiertos | Efecto red / retención |
| **Panel del dueño (analytics)** | Cuentas, ocupación, no-shows, mapa de calor de horas vacías | Justifica la mensualidad |

### Monetización
Mensualidad por complejo por tramos de canchas + (opcional) fee por reserva o por
hora muerta recuperada. El módulo social es gratis: es el gancho de adquisición.

---

## 2. Alcance

### MVP — single-tenant (un solo complejo)
Decisión del producto: lanzar y pulir con **un complejo piloto**. La UI y la
lógica asumen un solo complejo.

**Hedge barato (recomendado, no negociable a nivel de esquema):** todas las
tablas de negocio llevan `sede_id`. Generalizar a multi-complejo más adelante =
añadir tabla `organizacion` + UI de gestión + scoping en middleware, **no**
reescribir el modelo de datos ni la autorización.

### Roadmap por fases
1. **Fundaciones** — monorepo, Postgres + Prisma, auth + RBAC, design system base.
2. **MVP reservas** — catálogo público, disponibilidad, hold de slot, pago manual + aprobación, WhatsApp transaccional, panel admin básico.
3. **Analytics del dueño** + pago parcial (abono).
4. **Recuperación de ingresos** — cancelaciones → ofertas last-minute + web push + descuentos exprés.
5. **Social** — perfiles, partidos abiertos, split de pago, matchmaking.
6. **Hardening** — pentest interno, backups probados, rate limits, auditoría, pruebas de carga.

---

## 3. Modelo de dominio

### Entidades

- **Sede** — el complejo. Datos fiscales, ubicación, contactos, config de pagos móviles.
- **Cancha** — pertenece a Sede. Deporte, superficie, techada (bool), capacidad, fotos, reglas de precio.
- **PlantillaHorario** + **ExcepcionHorario** — disponibilidad recurrente y overrides (feriados, mantenimiento, torneos).
- **ReglaPrecio** — precio base + modificadores por franja (peak / off-peak), por día, por duración.
- **Reserva** — ver máquina de estados abajo. Cancha, franja (inicio/fin), jugador organizador, monto, canal (web / staff / oferta).
- **Pago** — asociado a Reserva o a Cuota. Monto, referencia, método (pago móvil, transferencia, efectivo, tarjeta), comprobante (archivo en MinIO), aprobado_por, timestamps, motivo_rechazo.
- **Cuota** (split) — participante + monto + estado (`pendiente` / `pagada` / `aprobada` / `vencida`). La reserva se confirma cuando todas las cuotas están `aprobada` **o** el organizador cubre el resto.
- **Oferta** — tipo (`expres` | `last_minute`), cancha/franja objetivo, descuento, ventana (inicio/fin), cupo, audiencia (filtros deporte/zona/opt-in). `last_minute` se dispara al cancelarse una reserva confirmada dentro de la ventana crítica.
- **PartidoAbierto** — deporte, nivel, fecha, cancha (reservada o por reservar), cupos, cuota por jugador, estado. Puede enlazar a una Reserva con split.
- **PerfilJugador** — nivel por deporte, reputación, zona, preferencias de notificación.
- **Usuario** + **Rol** — ver RBAC.
- **AuditLog** — actor, acción, entidad, antes/después, ip, timestamp. Para acciones sensibles (aprobar/rechazar pago, cancelar, refund, cambiar precio, banear).
- **Notificacion** — destinatario, canal, plantilla, payload, estado de entrega.

### Máquina de estados de Reserva

```
borrador
  → pendiente_pago        (slot en HOLD; TTL ~15 min para enviar comprobante)
  → comprobante_enviado   (usuario subió/mandó comprobante)
  → en_revision           (admin/staff la tiene en cola; TTL ~2 h para decidir)
  → confirmada            (pago aprobado; WhatsApp de confirmación)
  → completada            (partido jugado)
  ↘ no_show               (confirmada pero nadie asistió → afecta reputación)
  ↘ cancelada             (por usuario o admin; si estaba confirmada y entra en
                           ventana crítica → genera Oferta last_minute)
  ↘ expirada              (venció un TTL → el HOLD se libera solo)
```

- **HOLD de slot**: al pasar a `pendiente_pago` se toma un lock (Redis + fila en
  DB con `expira_en`). Nadie más puede reservar esa franja. Un job libera holds
  vencidos y transiciona la reserva a `expirada`.
- Todos los TTL son configurables por Sede.

### Duración variable y pago parcial ("abono")

Una cancha tiene una **unidad base** (`Cancha.duracionTurnoMin`, por defecto
60 min) y un **máximo** (`duracionMaximaMin`, por defecto 180). El jugador
elige cuántas unidades quiere (1h, 2h, 3h…) sobre un horario libre; el precio
se calcula **sumando cada unidad con su propia tarifa** (nunca la tarifa de
la unidad de inicio aplicada a todo el bloque — si la reserva cruza de
horario normal a peak, cada hora paga lo que le toca).

`SlotLock` guarda **una fila por unidad ocupada**, no una por reserva: así el
mismo `@@unique([canchaId, inicio])` que impide doble-reservar una hora
también impide que se solapen reservas de distinta duración, sin necesitar
una exclusion constraint de rangos en Postgres. Una reserva de 2h crea 2
filas; liberar/extender el HOLD sigue siendo un solo `deleteMany`/`updateMany`
por `reservaId`.

**Pago parcial ("abono")**: muchos clubes exigen abonar por adelantado solo
una parte en reservas largas (p.ej. la primera hora) y cobran el resto en
efectivo/pago móvil **al llegar, antes de entregar la pelota**. Config por
sede: `pagoParcialActivo`, `pagoParcialDuracionMinMin` (desde cuántos minutos
aplica — default 120 = 2h), `pagoParcialHorasAdelanto` (cuántas horas se
abonan por adelantado — default 1). `Reserva.montoAbono` es lo que hay que
abonar en línea (comprobante) para confirmar; `montoRestante` es lo
que el staff cobra en sitio y marca con
`POST /api/reservas/[id]/cobrar-restante` (UI: sección "Por cobrar al llegar"
en `/panel`) — el staff recibiéndolo en persona ES la verificación humana,
igual criterio que aprobar un comprobante. **Solo aplica sin split** — con
split, el organizador ya cubre el 100% entre las cuotas antes de confirmar.

### Cuentas: qué exige cuenta y qué no

- **Reservar NO exige cuenta.** Sin sesión, se reserva "como invitado": nombre +
  teléfono (email opcional). Se crea un `Usuario` con `esInvitado=true` (sin
  `PerfilJugador` — así queda afuera del matching de ofertas/partidos) y el
  acceso a SU reserva es por `accessToken` (como un `inviteToken`, pero para
  toda la reserva), nunca por login. Rate-limit propio y más estricto
  (`guestBooking`) porque cada intento crea un Usuario y toma un HOLD real.
- **Dividir el pago, crear/unirse a partidos abiertos, y recibir ofertas de
  última hora / descuentos SÍ exigen cuenta.** Un invitado que reserva no
  puede armar un split (se bloquea en el esquema y en el handler); si quiere
  esas features, tiene que registrarse.
- Los invitados del split (a los que SÍ invita alguien con cuenta) tampoco
  necesitan cuenta para pagar su parte — ver más abajo.

### Flujos críticos

1. **Reserva + pago móvil manual**: reservar (con o sin cuenta) → HOLD → pagar
   por fuera → enviar comprobante → cola de revisión → **un humano del club
   aprueba o rechaza** → confirmación por WhatsApp. Si expira, el slot se
   libera. **Subir el comprobante nunca aprueba nada por sí solo** — pago
   móvil no está automatizado; siempre lo revisa una persona
   (`SEDE_STAFF`/`SEDE_ADMIN`) antes de que la reserva pase a `CONFIRMADA`.
2. **Cancelación → last-minute**: reserva confirmada se cancela en ventana
   crítica → slot a "ofertas de última hora" con descuento → **web push +
   in-app + email** a jugadores opt-in que hacen match. **WhatsApp NO.**
3. **Split con amigos**: organizador (con cuenta) arma reserva, invita por link,
   cada quien paga su parte, barra "3/4 pagado", TTL para completar antes de
   perder el slot. **Los invitados NO necesitan cuenta**: cada Cuota (salvo la
   del organizador) lleva un `inviteToken` (UUID v4) que da acceso público de
   un solo propósito a `/pagar/[token]` — ahí ven el monto y los datos de pago
   móvil, y suben su comprobante sin registrarse. El organizador comparte esos
   links (por WhatsApp, por ejemplo). Si alguien del grupo sí tiene cuenta y
   quiere asociar su pago a su perfil, se une por `/api/partidos` en vez de
   por link.
   **Si alguien no paga**, el organizador puede cubrir esa parte —
   `POST /api/reservas/[id]/cuotas/[cuotaId]/cubrir` — entera (la cuota pasa a
   su nombre, se invalida el link del invitado) o con un **monto
   personalizado** (paga una parte, el invitado sigue debiendo el resto: la
   cuota original se reduce y se crea una cuota nueva a nombre del
   organizador). En los dos casos sigue pasando por la cola de revisión normal
   — cubrir no aprueba nada, solo dice "esta parte la pago yo".
4. **Matchmaking**: jugador busca/crea PartidoAbierto (deporte, fecha, nivel) →
   al llenarse se confirma la cancha y se cobra el split.

### Anti-abuso
Reputación y conteo de no-shows por jugador · límite de reservas activas sin
confirmar · posible seña para jugadores nuevos · lista de bloqueo por sede.

---

## 4. Arquitectura

### Monorepo (pnpm workspaces + Turborepo)

```
apps/
  web/        Next.js 15 (App Router, TS). SSR catálogo público + API/server actions transaccional.
  worker/     Node. Baileys (WhatsApp), BullMQ jobs, timers (expiración de holds, disparo de ofertas, recordatorios).
packages/
  db/         Prisma schema + cliente + migraciones + seed.
  shared/     Tipos, esquemas Zod, máquinas de estado, constantes de dominio.
  ui/         Design system (componentes, tokens, tema).
infra/        docker-compose, config Dokploy/Coolify, scripts de backup.
```

El **worker es un servicio aparte** a propósito: si WhatsApp se cae o nos
banean, la web sigue funcionando. Comunicación web ↔ worker vía colas Redis.

### Servicios (Docker)

| Servicio | Uso |
|---|---|
| **PostgreSQL** | Datos. Self-hosted. Sin SQLite: hay concurrencia real (holds), transacciones y analítica pesada. |
| **Redis** | Locks de slot, colas BullMQ, pub/sub realtime, rate limiting. |
| **MinIO** | S3 self-hosted para comprobantes de pago. Cifrado en reposo. |
| **web** | Next.js. |
| **worker** | Jobs + WhatsApp. |
| **Traefik/Caddy** | Reverse proxy + HTTPS automático. |

### Hosting
**1 VPS** (Hetzner ~€5–12/mes) con **Dokploy o Coolify**: DX tipo Vercel/Supabase
(deploys por git, DB, logs, backups) pero self-hosted y sin mensualidad de
plataforma. Migrar piezas a más servidores cuando duela. Nada de mensualidades
tipo Supabase.

**Demo gratis (Render)**: para mostrarle el producto a un club antes de
vender, hay un camino alterno gratis en **[`RENDER.md`](./RENDER.md)** +
[`render.yaml`](./render.yaml) — Render (web + Postgres free) + Upstash
(Redis free) + Cloudflare R2 (S3 free) porque Render ya no tiene Redis
gratis. El worker (WhatsApp/BullMQ) no corre en el plan free — la demo
cubre todo el camino feliz de reservar/pagar/aprobar/cancelar/split/
partidos, pero sin recordatorios ni WhatsApp real. Esto es solo para demos
puntuales, no reemplaza la arquitectura de producción de arriba.

### Realtime y notificaciones

| Canal | Uso | Notas |
|---|---|---|
| **SSE + Redis pub/sub** | Tablero en vivo del admin (nueva reserva, comprobante entrante, slot liberado) | |
| **Web Push (VAPID)** | Ofertas exprés y last-minute, descuentos | Gratis, sin riesgo de baneo. Service worker + opt-in. |
| **Email** (Resend free / SMTP propio) | Respaldo de ofertas + recibos | |
| **WhatsApp (Baileys)** | **Solo transaccional y bajo volumen**: confirmación de reserva, recepción de comprobante, recordatorio, resultado de aprobación | Nunca marketing/ofertas → riesgo de ban. |

---

## 5. Seguridad y datos

> **Requisito duro.** El modelo de amenazas completo, los controles y la
> checklist de auditoría por release están en **[`SECURITY.md`](./SECURITY.md)**.
> Las primitivas viven en **`packages/security`** (headers/CSP, rate-limit,
> idempotency, csrf, upload-guard, password) y se aplican en
> `apps/web/middleware.ts` + el helper `apps/web/src/lib/guard.ts`.
> Correr `/security-review` sobre el diff antes de cada merge.

Resumen de capas:

- **SQLi**: Prisma parametriza; `$queryRawUnsafe`/`$executeRawUnsafe` y la
  concatenación de SQL están **bloqueados por ESLint** (`eslint.config.mjs`).
  SQL crudo solo con tagged templates. DB user sin DDL en runtime, TLS en prod.
- **DoS / capa 7**: rate-limit Redis (ventana deslizante) en todo endpoint
  mutante vía `guard()`; body-size limits; trabajo pesado a BullMQ; WAF
  (CrowdSec) en el reverse proxy.
- **Reenvío de formulario / doble reserva**: idempotency keys + `@@unique`
  en `SlotLock` (P2002 → 409) + lock Redis del HOLD + barrido del worker.
- **CSRF**: middleware con Origin allowlist + token double-submit (tiempo
  constante).
- **XSS**: CSP por nonce + `strict-dynamic`, sin `unsafe-inline` de scripts;
  `dangerouslySetInnerHTML` vetado por ESLint.
- **Auth**: Better Auth (o Auth.js) self-hosted. Argon2id para contraseñas.
  Sesión opaca en cookie `HttpOnly`/`Secure`/`SameSite`, vida corta, rotación.
  Backoff + lockout de login. 2FA obligatorio para roles admin.
- **RBAC**: `plataforma_admin` (nosotros) · `sede_admin` · `sede_staff` (solo
  aprueba/rechaza pagos y ve cola) · `jugador`.
- **Scoping por `sede_id`**: middleware Prisma que fuerza el filtro en toda
  query de negocio. Ninguna query de negocio sin `sede_id`.
- **Validación**: Zod en **todo** input (API, server actions, params). Tipos
  compartidos desde `packages/shared`.
- **Hardening web**: rate limiting (Redis), CSRF, headers seguros, CSP estricta,
  cookies `Secure`+`HttpOnly`+`SameSite`, sin secretos en el cliente.
- **Comprobantes**: acceso solo por URL firmada de MinIO con expiración. Nunca
  públicos. Escaneo de tipo/tamaño al subir.
- **PII mínima**: guardar lo imprescindible. Teléfono y comprobante son
  sensibles. Retención y borrado definidos por política.
- **AuditLog** obligatorio en acciones sensibles (§3).
- **Backups**: `pg_dump` automático cifrado a **Backblaze B2** (centavos/mes) +
  prueba de restore mensual. MinIO también respaldado.
- **Secretos**: variables de entorno gestionadas por Dokploy/Coolify, nunca en
  el repo. `.env.example` documentado.
- **TLS** en todo. HSTS.

---

## 6. Panel del dueño — métricas

Rango de fechas + export CSV en todas:

- Ingresos: confirmado vs pendiente vs abonado (pago parcial).
- Horas reservadas / mes.
- Tasa de ocupación por cancha.
- **Mapa de calor día × hora** de huecos (horas y días más vacíos).
- No-shows y tasa de cancelación.
- Ticket promedio.
- Clientes recurrentes / nuevos.
- Ingresos recuperados por ofertas last-minute.

---

## 7. Dirección de diseño

**Concepto: "superficies de cancha".** Llamativo, físico y **vibrante** — **no**
el look genérico de IA (nada de Inter + morado + glassmorphism por defecto).
Tokens en **`packages/ui/src/tokens.css`** (prefijo `--pl-`).

- **Paleta VIBRANTE** derivada de superficies reales:
  - Arcilla / clay `#E4542A` (`--pl-clay`) — acento primario.
  - Grass `#12A150` (`--pl-grass`).
  - Cancha dura `#1D80C4` (`--pl-hard`).
  - **Volt** `#D6F000` (`--pl-volt`) — amarillo óptico de pelota de tenis, solo
    para realces (badges, foco, detalles).
  - Fondo hueso `#F5F0E3`, papel `#FFFDF7`, tinta `#1D1913`. Blanco puro solo
    para líneas de cancha sobre bloques de color.
  - Estados: `--pl-ok` verde, `--pl-warn` ámbar, `--pl-danger` rojo, `--pl-info` azul.
- **Tipografía**: *Bricolage Grotesque* (display) + *Instrument Sans* (texto).
  Nunca Inter/Roboto/Arial por defecto.
- **No abusar de las cards**: layouts abiertos, divisores hairline, secciones que
  respiran. Reservar `.card` para lo que de verdad es una unidad.
- **Alertas de primera clase**: componente `<Alert>` (`@pelotea/ui`) con tonos
  info/ok/warn/danger para hold por vencer, comprobante recibido, oferta tomada,
  aprobación/rechazo. `role="alert"` en warn/danger.
- **Paginación real** (no scroll infinito): componente `<Pagination>` en todo
  listado largo (reservas, clientes, partidos, cola de pagos).
- **Componentes con personalidad**: slot estilo **ticket de cine** (perforado),
  barra de progreso de split, heatmap con la rampa clay, líneas de cancha como
  decoración de encabezados.
- **Movimiento**: transiciones físicas, no fades genéricos. Respetar
  `prefers-reduced-motion` (ya en `tokens.css`).
- **Fotografía real** de canchas venezolanas, no ilustración stock.
- **Responsive** mobile-first. Accesible: contraste AA, `:focus-visible`,
  navegable por teclado, targets ≥ 44px.
- **Español de Venezuela — tuteo, sin voseo.** "Reserva / Aparta / Elige / Paga
  / Envía / Crea / Únete", nunca "Reservá / Apartá / Elegí". Nada de
  "tenés/querés/podés". `lang="es-VE"`.

El concepto visual (mockups estáticos de las 5 pantallas clave) vive en el
design canvas: https://claude.ai/code/artifact/28aba4c6-7bc2-4382-a0de-3258111111b7
Artboards: Landing pública · Reserva tipo cine · Pago móvil (mobile) · Panel del
club · Partidos abiertos (mobile). Fuentes editables: `*.dc.html` + `canvas.json`
en la raíz del repo.

---

## 8. Convenciones de desarrollo

- **TypeScript estricto** en todo el monorepo. Sin `any` salvo justificación.
- **Zod** como fuente de verdad de validación; derivar tipos de los schemas.
- **Prisma** para acceso a datos. Migraciones versionadas. **Prohibido**
  `$queryRawUnsafe`/`$executeRawUnsafe` y concatenar SQL (ESLint lo bloquea);
  SQL crudo solo con tagged templates.
- **Máquinas de estado** (reserva, cuota, oferta) centralizadas en `packages/shared`; las transiciones no se hacen "a mano" en los handlers.
- **Route handlers / server actions**: envolver en `guard()` (rate-limit + Zod +
  idempotencia), verificar rol y `sedeId`, transacción cuando toque dinero o
  estado. Runtime `nodejs` para lo que use Redis/Prisma.
- **Jobs** en `apps/worker` vía BullMQ; idempotentes y con reintentos.
- **Tests**: Vitest para lógica de dominio (state machines, pricing, splits) y
  para `packages/security`. Playwright para flujos críticos (reservar, aprobar
  pago, cancelar → oferta) y para pruebas de abuso (CSRF, doble submit, rate-limit).
- **Commits**: Conventional Commits. Ramas de feature, nunca commit directo a `main`.
- **Formato**: Prettier + ESLint (flat config raíz). Pre-commit hook.
- **Idioma**: español de Venezuela (tuteo, sin voseo). Textos fuera del código.

---

## 9. Variables de entorno

La lista canónica y comentada está en **[`.env.example`](./.env.example)** en la
raíz — mantenerla sincronizada. Grupos: base de datos, Redis, S3/MinIO
(`S3_ENDPOINT`, `S3_ACCESS_KEY`, …, `S3_PUBLIC_ORIGIN` para la CSP), auth
(`AUTH_SECRET`, `AUTH_URL`), Web Push (`WEB_PUSH_VAPID_*`), WhatsApp
(`WHATSAPP_SESSION_DIR`, `WHATSAPP_ADMIN_NUMBER`), email, backups B2, `SENTRY_DSN`,
`APP_BASE_URL`, y `DEFAULT_SEDE_SLUG` (sede activa del MVP single-tenant).

---

## 10. Comandos

Requisitos: Node ≥ 22 (`.nvmrc` = 24), pnpm (`corepack enable pnpm`), Docker.

```bash
corepack enable pnpm          # habilita pnpm (viene con Node)
pnpm install                  # instala el monorepo
pnpm infra:up                 # Postgres + Redis + MinIO (docker compose)
cp .env.example .env          # completar secretos
pnpm db:generate              # genera el cliente Prisma
pnpm db:migrate               # aplica migraciones (crea la primera)
pnpm db:seed                  # sede piloto + canchas + usuarios de prueba
pnpm dev                      # web (:3000) + worker en paralelo (turbo)
pnpm --filter @pelotea/web dev
pnpm --filter @pelotea/worker dev
pnpm lint | pnpm typecheck | pnpm test
pnpm db:studio                # Prisma Studio
```

---

## 10b. Estado del scaffold (Fase 1 — en curso)

```
apps/
  web/     Next 15 (App Router). middleware de seguridad, guard() de route
           handlers.
           API: /api/auth/{registrar,entrar,salir} (Argon2id, lockout
           progresivo, sesión opaca en cookie), /api/reservas,
           /api/reservas/[id]/comprobante (upload por magic-bytes → MinIO),
           /api/reservas/[id]/cancelar (genera Oferta LAST_MINUTE si aplica),
           /api/pagos/[id]/resolver (aprobar/rechazar, RBAC), /api/health.
           UI: landing vibrante, /canchas/[canchaId] (slot picker real con
           disponibilidad calculada en servidor), /reservas/[id]/comprobante
           (countdown + subida de comprobante), usando <Alert>/<Pagination>.
           Auth propia (sesión por token opaco) — Better Auth queda como
           opción de migración futura, no bloqueante.
  worker/  BullMQ: hold-expiry, revision-expiry, oferta-dispatch (fan-out de
           ofertas a jugadores opt-in por Web Push/email — nunca WhatsApp) +
           barridos. Falta: whatsapp-out (Baileys) y recordatorios.
packages/
  db/        Prisma schema COMPLETO (dominio §3) + seed + prismaParaSede().
             Usuario con lockout de login (loginIntentosFallidos/loginBloqueadoHasta).
  shared/    constants, state/reserva (máquina de estados) + tests, domain/pricing
             + tests, schemas Zod (incl. auth y cancelación).
  security/  headers/CSP, rate-limit, idempotency, csrf, upload-guard, password,
             session — con tests unitarios (csrf, upload-guard, password).
  ui/        tokens.css (paleta vibrante), <Alert>, <Pagination>.
infra/       docker-compose (pg + redis + minio + bucket init).
eslint.config.mjs       reglas anti-SQLi / anti-eval / anti-innerHTML.
.github/workflows/ci.yml  lint + typecheck + test + audit en cada push/PR.
```

**Split de pago**: `/api/cuotas/[id]/comprobante` (participante sube su parte) +
`/api/cuotas/[id]/resolver` (staff aprueba/rechaza; confirma la reserva sola
cuando `splitCompleto()`).
**Matchmaking**: `/api/partidos` (crear + listar con cursor) +
`/api/partidos/[id]/unirse` (cupo con UPDATE condicionado, sin condición de
carrera). **Panel del dueño**: `/api/admin/metricas` (ingresos, ocupación,
no-shows, heatmap día×hora vía `$queryRaw` parametrizado). **Web Push real**:
`/api/push/suscribir` + worker con `web-push` (borra suscripciones muertas en
404/410). **WhatsApp real**: `apps/worker/src/lib/whatsapp.ts` (Baileys,
transaccional, reconexión automática).

**Split sin cuenta**: `/api/reservas` ahora calcula el precio real (plantilla +
reglas, ya no un stub en 0) y, si `dividir` viene seteado, crea las `Cuota`
—la del organizador ligada a su sesión, las demás con `inviteToken` público.
`/pagar/[token]` es la página pública (sin login) donde cada invitado ve su
monto y sube su comprobante (`/api/cuotas/token/[token]/comprobante`).
`/reservas/[id]/comprobante` distingue reserva simple vs. dividida y en este
último caso muestra el resumen del split con los enlaces para compartir
(`SplitResumen.tsx`). Nuevo helper `confirmarDirectamente()` en
`packages/shared` — encadena las transiciones para pagos que llegan ya
verificados (split completo), usado por ambos endpoints.

**Endurecimiento de esta pasada**: `packages/db/prisma/roles.sql` (rol de app
de privilegio mínimo, límite de conexiones, `statement_timeout`),
`infra/docker-compose.prod.yml` (Postgres/Redis/MinIO sin puertos publicados
al host en prod, Redis con `requirepass`), rate-limit `global` hasta en
endpoints públicos sin auth, y el modelo de seguridad de los links de
invitado (SECURITY.md §2.8b).

**Reservar sin cuenta**: `Usuario.email` ahora nullable + `esInvitado`;
`Reserva.accessToken` (como el `inviteToken` de Cuota, pero para toda la
reserva). `/api/reservas` acepta `invitado:{nombre,telefono,email?}` sin
sesión (rate-limit propio `guestBooking`, más estricto) y bloquea `dividir`
sin cuenta. `apps/web/src/lib/acceso-reserva.ts` centraliza el chequeo
"sesión-dueño O token válido", usado por `/api/reservas/[id]/comprobante` y
`/cancelar`. UI: `SlotPicker` pide nombre+teléfono cuando no hay sesión;
`/reservas/[id]/comprobante?token=...` funciona sin login.

**El organizador cubre lo que falta**: `/api/reservas/[id]/cuotas/[cuotaId]/cubrir`
— cobertura completa (reasigna la cuota) o monto personalizado (la reduce y
crea una cuota nueva a su nombre). Sigue exigiendo su propio comprobante +
aprobación humana, como cualquier cuota.

**Destacar las ventajas de tener cuenta (UX/engagement)**: componente
`<BeneficiosCuenta>` (`@pelotea/ui`, variantes `compact`/`full`) en el
`SlotPicker` (invitado), `/pagar/[token]` y `/reservas/[id]/comprobante`.
`/api/auth/completar-cuenta` deja que un invitado que YA reservó convierta esa
reserva en cuenta real con solo una contraseña (el Usuario invitado ya existe;
esto le agrega password + email + `PerfilJugador`) — inicia sesión al toque.
Páginas `/entrar` y `/registrarse` reales (antes solo se linkeaban).

**Matchmaking en la UI**: `/partidos` (lista pública con "cargar más" por
cursor, `<BeneficiosCuenta compact>` si no hay sesión, unirse exige cuenta) y
`/partidos/crear` (formulario, auth-gated).

**Recordatorios**: `apps/worker/src/jobs/recordatorios.ts` — barrido cada 15
min, notifica (WhatsApp + in-app) ~2-4 h antes de un turno `CONFIRMADA`,
idempotente por payload igual que `oferta-dispatch`.

**Panel del dueño en la UI**: `/panel` (auth-gated, `SEDE_STAFF`/`SEDE_ADMIN`/
`PLATAFORMA_ADMIN`) — KPIs, heatmap día×franja (`Heatmap.tsx`, sin librería de
charts) y **cola de aprobación real** (`ColaAprobacion.tsx`, paginada con
`<Pagination>`): aprobar/rechazar ahí mismo (detecta si el pago es de una
reserva completa o de una cuota de split y llama el endpoint correcto),
"Ver comprobante" abre una URL firmada de 2 min
(`/api/pagos/[id]/comprobante-url`, nunca el archivo directo). Lógica de
métricas extraída a `apps/web/src/lib/metricas.ts`, compartida con
`/api/admin/metricas`.

**Bug de tipos corregido**: varios componentes usaban `React.FormEvent` /
`React.CSSProperties` sin importar `React` — típeaba mal y rompía
`pnpm typecheck`/`next build`. Se agregó `import type * as React from 'react'`
donde hacía falta (10 archivos).

**Duración variable + pago parcial (abono)**: ver "Duración variable y pago
parcial" en §3. Tocó `Cancha` (`duracionMaximaMin`), `SlotLock` (una fila por
unidad, `reservaId` ya no `@unique`), `Reserva` (`montoAbono`/`montoRestante`/
`restanteCobrado*`) y `Sede` (`pagoParcial*`). Nuevo
`calcularAbono()` en `packages/shared`. `/api/reservas` ahora valida y
cobra por unidad (nunca confía en un total del cliente), crea N `SlotLock`
con `createMany` (todo o nada), y usa `montoAbono` — no el total — como
monto esperado del comprobante. `SlotPicker` deja elegir 1h/2h/3h... solo
hasta donde de verdad hay hueco libre (`unidadesConsecutivas` de
`disponibilidad.ts`) y muestra el desglose abono/resto antes de reservar.

**Auto-reserva al llenarse un partido**: al unirse el último cupo,
`autoReservarPartido()` reserva la cancha y divide `precioPorJugador ×
cupos` entre todos los que se unieron — en una transacción SEPARADA de la de
unirse: si alguien más tomó ese turno mientras tanto, la unión al partido
queda firme igual y solo el auto-booking se cancela (el club la reserva a
mano). Reutiliza `dividirEnCuotas()`; no pasa por pago parcial (el split ya
cubre el 100%).

**`pnpm install` corrido y validado de punta a punta** (2026-09-13):
`pnpm typecheck` / `pnpm lint` / `pnpm test` (35 tests) / `pnpm build` (web,
33 rutas, y worker) — todo en verde. Esto encontró y corrigió bugs reales que
solo aparecen al compilar de verdad:
- Faltaba `@types/node` en `packages/db` y `packages/security`.
- Imports internos con extensión `.js` (`from './foo.js'`) — tsc los acepta
  con `moduleResolution: Bundler`, pero el webpack de Next no los resuelve
  contra código TypeScript de paquetes del workspace. Se sacó la extensión
  en 43 archivos.
- `packages/db/src/index.ts` reexportaba `Prisma` dos veces (una por
  `export * from '@prisma/client'`, otra a mano) → "Duplicate export".
- El binario nativo de `@node-rs/argon2` (napi-rs) rompía el build de
  webpack; hace falta externalizarlo a mano en `next.config.mjs` (`webpack:
  (config) => { config.externals.push({'@node-rs/argon2': 'commonjs
  @node-rs/argon2'}) }`) — `serverExternalPackages` solo no bastó. Aplica a
  cualquier dependencia nativa que se agregue después.
- `Algorithm.Argon2id` de `@node-rs/argon2` es un `const enum`: Next/SWC no
  puede inlinearlo con `isolatedModules`. Se usa el número literal (`2`) con
  el porqué en un comentario.
- `apps/web/src/lib/redis.ts` tenía `lazyConnect: false` — intentaba
  conectarse a Redis al importar el módulo, inundando `next build` de
  errores de conexión (Redis no corre en build-time). Ahora es `lazyConnect:
  true`.

**Casos que se revisaron a propósito al construir esto** (siempre antes de
dar por terminada una funcionalidad — pensar qué la rompe):
- **Comprobantes fantasma en la cola**: cancelar una reserva con un pago
  `EN_REVISION` lo dejaba flotando en `/panel` — un staff podía aprobar por
  error el pago de algo que ya no existe. Ahora se rechaza junto con la
  cancelación (y las cuotas pendientes pasan a `VENCIDA`).
- **Estado de UI que se queda viejo**: `ComprobanteForm` leía su estado
  inicial una sola vez (`useState(estadoInicial)`); si la reserva se
  confirmaba por otra vía mientras el formulario ya estaba en pantalla,
  seguía mostrando el formulario de subida de comprobante aunque ya no
  hiciera falta. Se sincroniza con el prop cuando cambia.

**Anti-abuso que estaba definido pero nunca aplicado**: `MAX_RESERVAS_ACTIVAS_SIN_CONFIRMAR`
existía como constante en `packages/shared` desde el principio, sin que
ningún endpoint lo usara — una cuenta podía apartar (HOLD) turnos sin límite
sin pagar ninguno. Ahora `/api/reservas` lo exige para usuarios con cuenta
(los invitados no tienen este tope — cada uno crea un Usuario nuevo — pero
sí el rate-limit `guestBooking` por IP).

**No-show**: `/api/reservas/[id]/marcar-no-show` (staff, solo sobre una
`CONFIRMADA` cuyo turno ya empezó) — penaliza `PerfilJugador.reputacion` y
suma `noShowCount` (si el organizador tiene perfil; un invitado no tiene
nada que penalizar, pero la reserva igual queda NO_SHOW para las métricas).
**Sin UI todavía** — hoy solo es una capacidad de API; falta el botón en un
listado de reservas del panel (que tampoco existe aún como vista propia).

**Ocupación real en `/panel`**: `calcularHorasDisponibles()` en
`@/lib/metricas` suma `PlantillaHorario` día por día y cancha por cancha en
el rango, restando los días con `ExcepcionHorario` tipo CIERRE completo
(una aproximación deliberada: un cierre parcial de unas horas no se
descuenta). `ocupacionPct = horasReservadas / horasDisponibles`.

### Corrección de política: el abono NO se devuelve si cancela el cliente

Regla del negocio: pagar 1 hora de abono y cancelar significa perder esa
hora — el club nunca devuelve nada cuando cancela el propio cliente. Si
**cancela el club** (`SEDE_STAFF`/`SEDE_ADMIN`/`PLATAFORMA_ADMIN`), la culpa
no es del cliente y el club puede devolver el abono — pero como todo el
dinero de este proyecto es manual (§5), esa devolución la hace el club por
fuera del sistema (efectivo, pago móvil de vuelta); `/api/reservas/[id]/cancelar`
no acredita nada automáticamente en ningún caso, solo cancela la reserva.

Como esto es dinero de por medio, se avisa ANTES de pagar (en el resumen de
`/canchas/[id]` y en la pantalla de pago móvil) y otra vez al cancelar
(`CancelarReserva.tsx` — antes no existía ningún botón de cancelar en la UI,
solo la API; ahora hay uno, con una confirmación explícita que distingue si
ya se pagó algo o no).

**`/panel/reservas`**: lista paginada de reservas confirmadas/jugadas/no-show
de la sede, con "No llegó" (`marcar-no-show`, solo si el turno ya empezó) y
"Cancelar" (cancelación del club — la devolución del abono, si aplica, la
hace el club por fuera del sistema, ver arriba) por fila. Cierra el vacío de
la pasada anterior: ya había API para no-show pero ningún botón en toda la
app.

**2FA (TOTP)**: `packages/security/twofa.ts` (`otpauth`, sin deps nativas —
no repite el lío de `@node-rs/argon2` con webpack). El secreto se guarda
CIFRADO (AES-256-GCM, clave derivada de `AUTH_SECRET`) en
`Usuario.twoFactorSecret`, nunca en texto plano; los códigos de recuperación
se guardan hasheados (SHA-256), igual que una contraseña.
- `/cuenta/2fa` — activar (QR + código de confirmación → muestra 8 códigos
  de recuperación UNA vez) / desactivar (exige contraseña + código actual).
- `/api/auth/entrar` ahora puede devolver `{requiere2FA, desafioId}` en vez
  de la cookie de sesión — el desafío vive en Redis 5 min, de un solo uso,
  con su propio rate-limit por `desafioId` (no por IP: alguien con la
  cookie del desafío tampoco puede fuerza-bruta el código).
  `/api/auth/2fa/verificar` completa el login con el código TOTP o un
  código de recuperación.
- **Obligatorio "blando" para roles admin**: `/panel` muestra un banner
  hasta que lo activan — no bloquea el acceso todavía (bloquearlo del todo
  necesitaría un flujo de "primero configura 2FA" antes de dejar entrar a
  un admin nuevo, que queda para después).

### Multi-moneda: precios en USD/EUR, cobro siempre en Bs

Muy común en Venezuela: el club fija sus tarifas en USD o EUR (para no
perseguir la inflación) pero SIEMPRE cobra en bolívares, al cambio del día
—y ese cambio lo carga alguien a mano, **nunca** hay scraping ni API del BCV
(sigue la regla de CLAUDE.md §5: el dinero acá es siempre manual).

- **`Sede.precioMoneda`** ('USD' | 'EUR' | 'VES', default 'USD'): en qué
  moneda están `Cancha`/`PlantillaHorario.precioBase`/`ReglaPrecio` (MONTO_FIJO).
  Si es 'VES', no hay conversión — el precio base ya está en bolívares.
- **`TasaCambio`** (`moneda`, `fecha`, `tasaVES`) — una fila por día que
  staff carga en `/panel/tasa-cambio`. Se usa la más reciente con
  `fecha <= hoy` (el BCV no publica fin de semana/feriado, así que "la de
  hoy" normalmente es la del último día hábil — la fecha se muestra siempre).
- **`Reserva`** congela la conversión al momento de reservar:
  `precioTotalRef`/`monedaRef` (el monto "real" en USD/EUR) y `tasaCambio`
  (Bs por unidad, ese día) — así si la tasa sube después, esa reserva ya
  hecha no cambia de precio. `precioTotal`/`montoAbono`/`montoRestante`
  siguen siendo SIEMPRE Bs — es lo que de verdad se transfiere.
- **Si no hay tasa cargada**, `calcularPrecioReserva()` rechaza la reserva
  con `sin_tasa_cambio` en vez de adivinar un número — mejor bloquear a
  cobrar mal. `/panel` muestra un aviso (bloqueante en el mensaje, no en el
  código) hasta que alguien la cargue.
- **UI**: `/canchas/[id]` y `/reservas/[id]/comprobante` muestran ambos
  montos ("USD 25 · ≈ Bs 4.750") y la tasa usada — nunca solo el número en
  Bs sin contexto de por qué es ese.
- **`PartidoAbierto.precioPorJugador`** queda en Bs directo, sin conversión
  — lo fija el organizador entre amigos, no es la tarifa oficial del club.

### 2FA obligatorio de verdad para roles admin (bloqueo, no aviso)

Antes, `/panel` mostraba un banner si el admin no tenía 2FA activo, pero
dejaba entrar igual — y la API nunca lo exigía, así que alguien con la
contraseña de un `SEDE_ADMIN`/`PLATAFORMA_ADMIN` podía llamar los endpoints
de API directo sin activar nada. Corregido en dos capas:

- **`requireRol()`** (`apps/web/src/lib/session.ts`) ahora lanza
  `2fa_requerido` si el rol es `SEDE_ADMIN`/`PLATAFORMA_ADMIN` y no tiene 2FA
  activo — bloqueo real a nivel de API, no solo de la UI. `SEDE_STAFF` queda
  afuera (solo aprueba/rechaza pagos, no toca configuración ni dinero de la
  sede) — sigue pudiendo entrar sin 2FA. Los 9 endpoints que ya usaban
  `requireRol` distinguen el código de error (`2fa_requerido` vs
  `sin_permiso`) en la respuesta.
- **`requireSesionPanel()`** (nuevo, `apps/web/src/lib/panel-guard.ts`)
  centraliza el chequeo de acceso a `/panel/*` — mismo criterio: si el rol
  es admin y no tiene 2FA, redirige a `/cuenta/2fa?next=...&obligatorio=1`
  en vez de mostrar el panel. Las 4 páginas de `/panel` lo usan ahora en vez
  de repetir el chequeo de rol a mano. `/cuenta/2fa` muestra un aviso
  "necesitas activarlo para entrar" cuando llega así, y al confirmar el
  código manda de vuelta a `next` (antes solo volvía al mismo formulario).

### UI para cambiar `Sede.precioMoneda`

`/panel/configuracion` (solo `SEDE_ADMIN`/`PLATAFORMA_ADMIN`) +
`PATCH /api/admin/sede` (`packages/shared` → `actualizarSedeSchema`). Antes
solo se podía fijar en el seed o a mano en la base.
**Caso revisado a propósito**: cambiar la moneda NO convierte los precios ya
cargados (`PlantillaHorario.precioBase`, `ReglaPrecio` MONTO_FIJO) — un
`precioBase` de "6" pasa de significar "6 USD" a significar "6 Bs" si se
cambia a VES, sin que nada lo convierta solo. La UI lo advierte explícito
antes de confirmar el cambio (con un paso de confirmación aparte) — no hay
todavía una pantalla para editar esos precios en bloque, así que por ahora
hay que revisarlos a mano después de cambiar la moneda.

### 2FA hecho bloqueo real (no solo aviso) + UI para `Sede.precioMoneda`

`requireRol()` (`apps/web/src/lib/session.ts`) ahora lanza `2fa_requerido` si
el rol es `SEDE_ADMIN`/`PLATAFORMA_ADMIN` sin 2FA activo — bloqueo real a
nivel de API, no solo el aviso de `/panel` de antes. `requireSesionPanel()`
(nuevo, `apps/web/src/lib/panel-guard.ts`) aplica lo mismo a las páginas de
`/panel/*`. `SEDE_STAFF` queda afuera (solo aprueba/rechaza pagos). Además,
`/panel/configuracion` + `PATCH /api/admin/sede` deja cambiar
`Sede.precioMoneda` desde la UI (antes solo por seed/DB directo) — con
aviso de que el cambio NO convierte los precios ya cargados.

### Bug de seguridad real: el middleware nunca corría en producción

Al armar pruebas de abuso encontré que `middleware.ts` estaba en la raíz de
`apps/web/` — pero como el proyecto usa `src/app`, Next.js (15.5.25) nunca lo
detectaba en el build de producción (`middleware-manifest.json` quedaba
vacío). Esto significa que **CSRF y los headers de seguridad (CSP, HSTS,
etc.) no estaban activos** en ningún `next build`/`next start` real, aunque
sí funcionaban en `next dev` — por eso pasó desapercibido en toda la
validación anterior (que corrió build/lint/test pero nunca un servidor real
con una request cruda). Corregido moviendo el archivo a
`apps/web/src/middleware.ts`. Verificado con un `next start` real: una
mutación sin Origin/CSRF ahora responde 403, y las respuestas GET llevan CSP
+ headers de seguridad. **Lección**: `pnpm build` en verde no prueba que el
middleware corra — hace falta levantar el server y mandar una request real
de vez en cuando.

### Corrección de terminología: "abono" es pago parcial, no crédito prepago

El usuario corrigió (2026-09-13): en este negocio **no existe** un crédito
prepago que el cliente cargue y use después — eso fue una funcionalidad que
inventé y nunca correspondió a como trabajan los clubes reales. "Abono" es
lo que ya estaba construido como "anticipo": pagar ahora una parte del total
de la reserva (p.ej. Bs 15 de una factura de Bs 30) para confirmarla; el
resto se cobra al llegar. Se eliminó por completo el crédito prepago —
modelos `Abono`/`MovimientoAbono`, enums `TipoAbono`/`MovimientoTipo`, rutas
`/api/abonos`, `/api/reservas/[id]/aplicar-abono`, `/panel/abonos`,
`/api/admin/usuarios/buscar` (existía solo para ese flujo) y el método de
pago `ABONO`— y se renombró el pago parcial de "anticipo" a "abono" en todo
el código (`Reserva.montoAnticipo` → `montoAbono`, `calcularAnticipo()` →
`calcularAbono()`, `PoliticaAnticipo` → `PoliticaAbono`, textos de UI). Ver
§3 "Duración variable y pago parcial" y §11 Glosario, ya actualizados.

### Inventario: gestión de canchas desde el panel

El admin ya no depende del seed/DB directo para su inventario. Nuevas
categorías de deporte: `BEACH_PADEL`, `VOLEIBOL` (además de las que ya
había — `VOLEY_PLAYA` sigue siendo la de playa, distinta de `VOLEIBOL`
indoor). Solo `SEDE_ADMIN`/`PLATAFORMA_ADMIN` (mismo criterio que
`/api/admin/sede`: es configuración de negocio, no operación diaria de
staff — y ya exige 2FA por `requireRol`).

- **`/panel/canchas`** — lista todas las canchas de la sede (activa/
  inactiva, deporte, si tiene horario configurado) + "Nueva cancha".
- **`/panel/canchas/nueva`** + `POST /api/admin/canchas` — nombre, deporte,
  superficie, techada, capacidad, unidad de turno y duración máxima. Nace
  **sin ninguna `PlantillaHorario`**, a propósito: mejor que no aparezca
  disponible mientras el club la está configurando, que asumir "24/7 por
  defecto" y arriesgar una reserva sobre un horario que no corresponde.
- **`/panel/canchas/[id]`** + `PATCH /api/admin/canchas/[id]` — edita los
  mismos campos y el botón de activar/desactivar (desactivar no cancela
  reservas ya hechas, solo la saca de disponibilidad para reservas nuevas —
  `/api/reservas` ya filtraba `activa: true`).
- **Editor de horario semanal** (`HorarioEditor.tsx`) +
  `PUT /api/admin/canchas/[id]/horario` — un bloque por día de semana
  (apertura, cierre, tarifa base), reemplaza toda la plantilla de la
  cancha de una vez. Upsert manual por día (no hay `@@unique([canchaId,
  diaSemana])` declarada — se busca la fila existente y se actualiza, o se
  crea si no hay ninguna) para no dejar nunca dos filas del mismo día
  compitiendo en `slotsDisponibles()`/`calcularPrecioReserva()`.

### Vacío real cerrado: `/canchas` (listado público) no existía

El CTA principal de la landing ("Ver canchas disponibles") apuntaba a
`/canchas` desde el arranque del proyecto — pero esa ruta nunca se creó,
solo `/canchas/[canchaId]`. Era un 404 en el camino más importante de todo
el producto y nadie lo notó porque la validación siempre fue
typecheck/lint/build/test, nunca clickear la app de verdad. Ahora existe
`/canchas/page.tsx`: lista las canchas activas de la sede con **filtro por
categoría de deporte** (pestañas — solo muestra las categorías que la sede
de verdad tiene, nunca las 9 posibles) y marca "próximamente" la que todavía
no tiene horario configurado (no clickeable). **Sin fotos por cancha a
propósito** — se consideró y el usuario lo descartó explícitamente: pesa
mucho para el valor que da; el filtro por categoría es lo que importa.

### Tarjeta de débito al cobrar el resto en sitio

`cobrarRestanteSchema` y el `<select>` de `PorCobrar.tsx` ahora aceptan
`TARJETA` además de efectivo/pago móvil — el cliente puede pagar el resto
de un abono (pago parcial) con datáfono al llegar. `Pago.metodo` ya tenía
`TARJETA` en el enum desde la limpieza del crédito prepago.

### Tarifas: moneda visible + conversión a Bs en vivo para el admin

El editor de horario (`HorarioEditor.tsx`, `/panel/canchas/[id]`) ahora
muestra en qué moneda se escribe cada tarifa (`Sede.precioMoneda`) y, si es
USD/EUR, el equivalente en Bs al lado de cada campo usando la tasa vigente
— así el admin ve de una vez cuánto le va a cobrar en bolívares al cliente,
sin adivinar. Si no hay tasa cargada, avisa en vez de mostrar un número
inventado (mismo criterio que `sin_tasa_cambio` en la reserva). El cliente
ya veía esto en `/canchas/[id]` desde la pasada de multi-moneda — esto solo
le da la misma claridad al admin mientras configura precios.

### Worker real en Render (ya no comentado) + limpieza de cola muerta

El usuario confirmó que le sirve correr Baileys en el plan free de Render
aunque se duerma tras inactividad. `apps/worker` ahora expone un servidor
HTTP mínimo (`lib/server.ts`, sin librerías) solo para que Render lo trate
como Web Service gratis — `render.yaml` ya no lo tiene comentado. `/qr`
sirve el código de emparejamiento de WhatsApp como imagen PNG (protegido
por `WHATSAPP_QR_TOKEN`, sin el cual el endpoint queda deshabilitado) en
vez de depender de leer ASCII en los logs. `iniciarWhatsapp()` ahora se
llama al arrancar el proceso, no en el primer mensaje — antes el QR nunca
aparecía hasta la primera reserva confirmada de verdad. De paso, se
eliminó `QUEUES.WHATSAPP_OUT`: era una cola declarada en `index.ts` sin
ningún productor ni consumidor real (WhatsApp se envía directo desde
`procesarNotificaciones`) — código muerto que parecía infraestructura viva.

### Configuración inicial sin seed: `/configurar` + fix real de deploy en Render

El usuario no quería depender del seed para arrancar un club — quería crear
la Sede y su propio usuario/contraseña desde la app. Ese flujo **no
existía**: `/registrarse` solo crea `JUGADOR`, nunca `SEDE_ADMIN`, y nunca
crea una `Sede`. Nuevo: `/configurar` (`ConfigurarClubForm.tsx`) +
`POST /api/setup` — crea la Sede (nombre + datos de pago móvil, opcionales)
y el primer `SEDE_ADMIN` en una transacción, e inicia sesión de una.
**Solo funciona una vez**: si ya existe una Sede con `DEFAULT_SEDE_SLUG`,
la página redirige a `/entrar` y el endpoint rechaza con `ya_configurado`
— sin este chequeo, cualquiera que encontrara la URL del deploy antes que
el dueño real podría crearse un admin. `getSedeActivaONull()` (nuevo en
`lib/sede.ts`) deja que `/canchas` muestre un estado vacío en vez de
reventar cuando todavía no hay ninguna sede — antes `getSedeActiva()`
lanzaba y esa página no tenía try/catch.

**Bug real de deploy encontrado al probar en Render de verdad**: el build
fallaba con `sh: 1: prisma: not found` en los dos servicios. Causa: Render
exporta `NODE_ENV=production` durante el build, y con eso `pnpm install`
**salta las devDependencies** — pero el CLI `prisma` (necesario para
`prisma generate`/`migrate deploy`) vivía en devDependencies de
`packages/db`. Sacando `prisma` y `tsx` a `dependencies` normales
(`@types/node`/`typescript` sí pueden quedarse en dev, esos no hacen falta
en runtime) se resuelve — es el mismo problema que golpea a cualquiera que
despliegue Prisma en Vercel/Docker con `NODE_ENV=production`. Otro fix de
la misma ronda: `render.yaml` traía `preDeployCommand`, que **no existe en
el plan free de Render** — la migración se movió al `startCommand`
(`prisma migrate deploy && next start`; es idempotente, así que repetirla
en cada wake-up del free tier no hace nada si ya está al día).

### Partidos comunitarios: confirmación explícita del organizador (2026-09-14)

Diseño pedido por el usuario, ver §3 "Matchmaking" — `PartidoAbierto` ya
soportaba `canchaId` opcional (categoría/deporte, no cancha puntual) pero
nada disparaba la reserva en ese caso: al llenarse el cupo,
`autoReservarPartido()` reservaba SOLA e instantáneamente, y exigía
`canchaId` ya fijado — con `canchaId` null (el caso comunitario) el partido
se quedaba trabado en `COMPLETO` para siempre.

Corregido: `unirse` ya no reserva nada al llenarse — solo marca `COMPLETO`
y avisa al organizador (WhatsApp + in-app, plantilla `partido.completo`,
repurpuesta — existía en el enum sin usarse). Nuevo
`POST /api/partidos/[id]/confirmar` (solo el organizador): revalida
disponibilidad en el pool de canchas de esa disciplina EN ESE MOMENTO
(pudo cambiar desde que se llenó) — recorre las canchas activas de ese
deporte (respetando una cancha puntual si el organizador la fijó al
crear), busca la primera con cupo libre en TODAS las horas que dura el
partido, y reclama las unidades atómicamente (mismo criterio que
`/api/reservas`). El organizador elige cómo se paga:
- **Dividir** (`dividir:true`): split entre todos los que se unieron —
  mismo mecanismo de `Cuota` que un split armado a mano.
- **Se encarga él** (`dividir:false`): reserva normal sin split — abono o
  pago completo según la política de pago parcial de la sede, igual que
  cualquier reserva individual.

`PartidoAbierto.estado` pasa a `CONFIRMADO` (antes muerto en el enum, nunca
se usaba) recién cuando la Reserva vinculada se aprueba de verdad —
`/api/pagos/[id]/resolver` y `/api/cuotas/[id]/resolver` (split) lo
sincronizan, y `/api/reservas/[id]/cancelar` lo devuelve a `COMPLETO` si la
reserva se cancela (el grupo sigue armado, solo hay que reintentar
confirmar). UI: `/cuenta` muestra "Confirmar y pagar" cuando corresponde,
con las etiquetas de estado en español en vez del enum crudo.

### Pool de canchas por disciplina + agenda del panel + descuentos programados

**Pool de canchas** (2026-09-13): `Cancha.cantidad` (default 1, no rompe
nada existente) agrupa varias canchas físicas idénticas de la misma
disciplina en una sola fila — al cliente no le importa cuál específica,
solo que haya cupo. `SlotLock.unidad` + `@@unique([canchaId, inicio,
unidad])` (antes `@@unique([canchaId, inicio])`) reparte el cupo real:
`/api/reservas` y `autoReservarPartido()` reclaman atómicamente una unidad
libre por hora dentro de la misma transacción. `disponibilidad.ts` expone
`cuposLibres` por horario. UI: cantidad en crear/editar cancha, "N de M
libres" en `SlotPicker`.

**Agenda del día** (`/panel/agenda`): `/panel/reservas` era solo una lista
plana, ilegible con muchas canchas/horarios/reservas del mismo tipo a la
misma hora. La agenda muestra cada tipo de cancha como grilla tipo
calendario (filas = franja horaria, columnas = un cupo del pool) con
columna estable por reserva multi-hora (mismo algoritmo de un calendario
para eventos solapados). Filtros como pills (`.pl-pill`, `.pl-date-input`
en `globals.css`) en vez de `<select>`/`<input>` con skin de navegador.
Incluye acción de "cobrar el resto" (pago parcial) inline.

**Bug de dinero real, dos veces**: `calcularMetricas()` (`@/lib/metricas`)
usaba `hasta = new Date()` (instante exacto) como fin de "últimos 30 días"
— una reserva ya CONFIRMADA para más tarde hoy quedaba afuera. Y marcar
NO_SHOW sacaba la reserva entera de "ingresos confirmados" (solo suma
CONFIRMADA/COMPLETADA) como si el abono ya cobrado se hubiera devuelto.
Ambos corregidos: `hasta` = fin del día de hoy, y el mismo "ingresos
retenidos" que ya existía para CANCELADA-con-abono ahora también cubre
NO_SHOW — lo cobrado NUNCA se devuelve, sea abono o 100%, cancele el
cliente o no llegue.

**Descuentos programados, no automáticos** (`/panel/descuentos`): las
ofertas EXPRES nunca tuvieron una forma de crearse — solo existían
LAST_MINUTE (automáticas, al cancelarse una reserva dentro de la ventana
crítica, y así se quedan: esas SÍ necesitan reaccionar solas para no perder
la hora). Nuevo modelo `ReglaDescuento` (cancha, día de semana o todos,
horario, % — creada a mano por un admin, `activa` toggle). El worker
(`jobs/materializar-descuentos.ts`, barrido cada 30 min) convierte cada
regla ACTIVA en filas de `Oferta` reales para los próximos 14 días
—idempotente por `@@unique([reglaId, inicioObjetivo])`, nunca duplica—
reusando toda la UI/notificación que ya existía para `Oferta` sin tocarla.
Al desactivar/borrar una regla, se cancelan las ofertas ya materializadas
que nadie tomó todavía (las que ya alguien reservó se dejan igual).

Pendiente inmediato: primera migración contra una Postgres real — ya no
bloqueada (Render la corre sola al arrancar, ver arriba); tests de abuso
end-to-end (Playwright: CSRF, doble submit, rate-limit — ya hay unit tests
de `rate-limit`/`idempotency` con `ioredis-mock` en `packages/security`);
una pantalla para editar `ReglaPrecio` (recargos peak/off-peak) desde el
panel — hoy solo se carga por seed/DB directo; **login con Google/Gmail**
pedido por el usuario como mejora cercana — necesita que el usuario cree
un proyecto en Google Cloud Console y dé Client ID/Secret (no se puede
generar solo); cuando se haga, evaluar Auth.js/next-auth en vez de rodar
OAuth a mano, ya que la sesión propia actual seguiría sirviendo para
email/password en paralelo.

---

## 11. Glosario

- **Sede / Complejo** — el negocio cliente (un solo tenant en el MVP).
- **Slot / Franja** — bloque reservable de una cancha (inicio–fin).
- **HOLD** — bloqueo temporal de un slot mientras se completa el pago.
- **Comprobante** — captura del pago móvil que el usuario envía y el staff aprueba.
- **Cuota** — parte del precio que paga cada participante en un split.
- **Abono** — la parte del total que el cliente paga por adelantado para confirmar una reserva larga (pago parcial); el resto se cobra al llegar. No se devuelve si cancela el cliente.
- **Oferta exprés** — descuento sobre horas que se ven vacías (decae con el tiempo).
- **Oferta last-minute** — descuento por un slot liberado tras una cancelación.
- **Partido abierto** — juego con cupos que otros jugadores pueden tomar.
- **No-show** — reserva confirmada a la que nadie asistió.
