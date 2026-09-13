# SECURITY.md — Pelotea

La seguridad es requisito duro. Este documento es el **modelo de amenazas + los
controles + la checklist de auditoría**. Se revisa en cada PR que toque auth,
pagos, uploads, o endpoints públicos. Correr `/security-review` antes de mergear.

---

## 1. Activos a proteger

| Activo | Sensibilidad |
|---|---|
| Comprobantes de pago (imágenes) | Alta — datos financieros de terceros |
| Teléfono / email de jugadores | Media-alta — PII |
| Credenciales y sesiones | Crítica |
| Datos de pago móvil del club | Media |
| Ingresos / analytics del club | Media — confidencial de negocio |
| Integridad de reservas (no doble-booking, no fraude de aprobación) | Alta |

---

## 2. Amenazas y controles

### 2.1 Inyección SQL
- **Control:** Prisma parametriza todo. Prohibido `$queryRawUnsafe` /
  `$executeRawUnsafe` y la concatenación de SQL — bloqueado por ESLint
  (`eslint.config.mjs`, reglas `no-restricted-*`). SQL crudo solo con
  tagged templates: `` prisma.$queryRaw`... ${x} ...` `` (así se hizo en
  `/api/admin/metricas` para el heatmap).
- **Control:** toda entrada se valida con Zod (`@pelotea/shared/schemas`) antes
  de tocar la DB. IDs con formato acotado.
- **Control:** usuario de Postgres de la app sin `SUPERUSER`, sin DDL en runtime
  (`packages/db/prisma/roles.sql` — `pelotea_app` de solo CRUD + límite de
  conexiones + `statement_timeout`; `pelotea_migrator` separado, solo en CI/
  despliegue). TLS (`sslmode=require`) a la DB en prod.

### 2.1b Acceso no autorizado a la base de datos
- **Control:** en producción, Postgres/Redis/MinIO **no publican puertos al
  host** (`infra/docker-compose.prod.yml` — `ports: !reset []`); solo son
  alcanzables desde `web`/`worker` por la red interna de Docker. El único
  servicio expuesto a internet es el reverse proxy.
- **Control:** Redis con `requirepass` en prod (`REDIS_PASSWORD`, nunca en el
  repo). Postgres con `password_encryption=scram-sha-256`, `max_connections`
  acotado, `statement_timeout` global.
- **Control:** `DATABASE_URL` con `connection_limit`/`pool_timeout` — un pico
  de tráfico no agota las conexiones de Postgres ni deja la app sin pool.
- **Control:** secretos de DB/Redis/MinIO fuera del repo (gestor de
  Dokploy/Coolify), rotables sin tocar código.

### 2.2 DoS / tumbar el backend (capa 7)
- **Control:** rate limiting con ventana deslizante en Redis
  (`@pelotea/security/rate-limit`), aplicado en **todo** endpoint mutante vía
  `withGuard`. Presets: `global` 300/min, `mutation` 40/min, `auth` 8/5min,
  `upload` 12/5min, `notify` 20/h.
- **Control:** body size limit (`serverActions.bodySizeLimit: 1mb`, y límite en
  el endpoint de upload: 5 MB, verificado por bytes).
- **Control:** timeouts de request y de query; `maxRetriesPerRequest` en Redis.
- **Control (infra):** Traefik/Caddy con límites de conexión + **CrowdSec**
  (o fail2ban) para banear IPs abusivas; Cloudflare/proxy delante si aplica.
- **Control:** trabajos pesados (notificaciones, ofertas) van a BullMQ, nunca
  en el request; el worker está aislado.
- **Control:** hasta los endpoints públicos sin auth (`GET /api/partidos`)
  llevan rate-limit `global` por IP — nada queda sin límite.

### 2.3 Reenvío de formulario / doble envío / doble reserva
- **Control:** **idempotency keys** (`Idempotency-Key` header, UUID) en crear
  reserva, enviar comprobante, unirse a partido, cubrir una cuota
  (`@pelotea/security/idempotency`). Segunda petición con la misma clave
  re-sirve el resultado; si está en curso → 409. Cubierto también con
  pruebas unitarias (`ioredis-mock`) en `packages/security/src/idempotency.test.ts`,
  igual que `rate-limit.test.ts` — antes ninguna de las dos tenía test.
- **Control:** `@@unique([canchaId, inicio])` en `SlotLock` — la DB rechaza la
  doble reserva concurrente del mismo turno (P2002 → 409 "slot ocupado").
- **Control:** lock rápido en Redis para el HOLD, con expiración; barrido del
  worker por si se pierde un job.
- **Control:** máquina de estados de `Reserva` centralizada — transiciones
  inválidas lanzan, no se “fuerzan” en los handlers.

### 2.4 CSRF
- **Control:** middleware verifica **Origin/Referer** contra allowlist +
  **token double-submit** (`pl_csrf` cookie SameSite=Lax reflejada en
  `x-csrf-token`), comparación en tiempo constante. Métodos seguros exentos.
- **Incidente corregido (2026-09-13): el middleware nunca corría en
  producción.** `middleware.ts` estaba en `apps/web/` (raíz), pero el
  proyecto usa `src/app` — Next.js 15.5.25 nunca lo detectaba en `next
  build`/`next start` (`middleware-manifest.json` quedaba `{}`). Esto
  significa que **CSRF y todos los headers de seguridad (CSP, HSTS,
  X-Frame-Options, etc.) estaban completamente inactivos** en cualquier
  build de producción, aunque sí funcionaban en `next dev` — invisible en
  todas las validaciones anteriores porque solo corrían `build`/`lint`/
  `test`, nunca un servidor real con una request cruda. Corregido moviendo
  el archivo a `apps/web/src/middleware.ts`; verificado con `next start` +
  `curl`: una mutación sin Origin ahora responde 403 `csrf`, y las
  respuestas GET llevan CSP/HSTS/etc. **Lección para el checklist de
  release: antes de dar por buena una pasada de seguridad, levantar el
  server compilado y mandar al menos una request cruda — un build en verde
  no prueba que el middleware esté corriendo.**

### 2.5 XSS / inyección en el cliente
- **Control:** CSP estricta por **nonce** + `strict-dynamic`, sin
  `unsafe-inline` para scripts (`@pelotea/security/headers`). `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`.
- **Control:** React escapa por defecto; `dangerouslySetInnerHTML` bloqueado por
  ESLint en `.tsx`.
- **Control:** headers `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS (prod).

### 2.6 Autenticación y sesiones
- **Control:** Argon2id (OWASP params) para contraseñas (`@pelotea/security/password`).
- **Control:** backoff progresivo de login + rate-limit `auth` por IP y por
  identificador; lockout de 24 h tras 12 fallos (reset por email).
- **Control:** sesiones con token opaco en cookie `HttpOnly` + `Secure` +
  `SameSite=Lax`, expiración corta, rotación al elevar privilegios.
- **Control:** 2FA (TOTP) obligatorio para `SEDE_ADMIN` y `PLATAFORMA_ADMIN`.
- **Implementado:** `/api/auth/registrar` y `/api/auth/entrar` — Argon2id,
  verify contra hash dummy cuando el email no existe (mitiga enumeración por
  timing), backoff progresivo + lockout (`loginBloqueadoHasta`), rate-limit
  `auth` por IP y por email. Sesión = token opaco de 256 bits en `Sesion`
  (revocable server-side), cookie `HttpOnly`/`Secure`(prod)/`SameSite=Lax`,
  TTL corto para roles admin/staff.
- **Implementado — 2FA (TOTP):** `packages/security/twofa.ts`. Secreto
  cifrado en reposo (AES-256-GCM, clave derivada de `AUTH_SECRET` — nunca en
  texto plano en la DB); códigos de recuperación hasheados (SHA-256), un
  solo uso cada uno, se muestran en texto plano UNA sola vez al activarlo.
  Login con 2FA no crea sesión hasta el segundo paso: `/api/auth/entrar`
  deja un desafío de un solo uso en Redis (5 min, rate-limit propio por
  `desafioId` — no alcanza con robar la cookie del desafío para fuerza-bruta
  el código). Desactivar exige contraseña actual Y un código válido, no
  alcanza con la sesión abierta.
- **Implementado — bloqueo real (no solo un aviso):** `requireRol()`
  (`apps/web/src/lib/session.ts`) lanza `2fa_requerido` si el rol es
  `SEDE_ADMIN`/`PLATAFORMA_ADMIN` y no tiene 2FA activo — los 9 endpoints de
  API que dependen de `requireRol` quedan bloqueados a nivel de API, no solo
  de UI (antes alguien con la contraseña de un admin podía llamar la API
  directo sin activar nada). `requireSesionPanel()`
  (`apps/web/src/lib/panel-guard.ts`) aplica el mismo criterio a las páginas
  de `/panel/*`: redirige a `/cuenta/2fa?next=...&obligatorio=1` en vez de
  mostrar el panel. `SEDE_STAFF` queda afuera a propósito — solo
  aprueba/rechaza pagos, no toca configuración ni dinero de la sede.
- **Pendiente:** reset de password por email; rotación de sesión al cambiar
  de rol.

### 2.7 Autorización / multi-tenant
- **Control:** RBAC (`PLATAFORMA_ADMIN` · `SEDE_ADMIN` · `SEDE_STAFF` · `JUGADOR`).
- **Control:** `prismaParaSede(sedeId)` inyecta `sedeId` en toda query de los
  modelos de negocio (`@pelotea/db`). Ningún handler consulta esos modelos sin
  `sedeId`. `SEDE_STAFF` solo puede aprobar/rechazar pagos y ver la cola.
- **Control:** IDOR — todo `findFirst` de recurso incluye `sedeId` y, cuando
  corresponde, `organizadorId`/propiedad. Aplicado también a los flujos
  nuevos: una `Cuota` solo la paga su `participanteId`; `unirse` a un
  partido valida `estado='ABIERTO'` y cupo con un UPDATE condicionado
  (`WHERE cuposLlenos < cuposTotales`) para no romperse ante una carrera.

### 2.8 Uploads (comprobantes)
- **Control:** validación por **magic bytes** (`@pelotea/security/upload-guard`),
  no por `Content-Type` ni extensión. Solo JPG/PNG/WEBP/PDF, ≤ 5 MB.
- **Control:** se guardan en MinIO (fuera del webroot), nombre de objeto
  generado (sin path traversal), y se sirven **solo por URL firmada** con
  expiración corta. Bucket sin acceso anónimo.
- **Control:** el `Content-Disposition` fuerza descarga; nunca render inline de
  HTML/SVG subido.

### 2.8b Links de invitado (split sin cuenta)
- **Control:** el `inviteToken` es un UUID v4 (122 bits de entropía) — el
  único secreto del link; no se puede enumerar ni adivinar por fuerza bruta
  en un tiempo útil.
- **Control:** `GET/POST /api/cuotas/token/[token]/*` devuelven `404`
  genérico tanto si el token no existe como si el formato es inválido — no
  hay oráculo para distinguir "no existe" de "formato malo".
- **Control:** rate-limit por IP y por token en la consulta y en la subida
  (mismo preset `upload`/`global` que el resto). Idempotencia por token +
  `Idempotency-Key`.
- **Control:** el link solo expone el monto de ESA cuota y los datos de pago
  móvil del club — nunca el teléfono/email del organizador ni de otros
  participantes, ni el resto de la reserva.
- **Control:** una vez la cuota pasa de `PENDIENTE`, el mismo token ya no
  acepta un nuevo comprobante (bloqueado por el chequeo de estado).

### 2.8c Reservar sin cuenta (invitado)
- **Control:** una reserva de invitado crea un `Usuario` real (`esInvitado`)
  pero **sin `PerfilJugador`** — queda afuera del fan-out de ofertas/partidos
  aunque alguien intente forzarlo desde el cliente (el matching consulta
  `PerfilJugador`, no `Usuario`).
- **Control:** rate-limit dedicado y más estricto (`guestBooking`, 5/hora por
  IP) — sin esto, cualquiera sin cuenta podría acaparar todos los turnos de
  un club (DoS de disponibilidad) sin ni registrarse.
- **Control:** `dividir` (split de pago) se rechaza explícitamente sin sesión,
  tanto en el esquema Zod (`.refine`) como otra vez en el handler — defensa
  en profundidad.
- **Control:** el acceso del invitado a SU reserva es por `accessToken` (UUID
  v4, igual garantía que el `inviteToken` de las cuotas — ver §2.8b),
  centralizado en `puedeAccederReserva()` para que ningún endpoint nuevo lo
  reinvente mal.

### 2.9 Fraude de aprobación de pago
- **Regla de producto, no solo de seguridad: el pago móvil NO está
  automatizado.** Subir un comprobante (organizador, invitado de cuota, o
  invitado de reserva) SIEMPRE deja el pago en `EN_REVISION`/`PAGADA` — nunca
  en `APROBADO`/`APROBADA`. Solo un humano (`SEDE_STAFF`/`SEDE_ADMIN`) puede
  mover eso a aprobado, en `/api/pagos/[id]/resolver` o
  `/api/cuotas/[id]/resolver`. El pago con abono (pago parcial) sigue esta
  misma regla — no hay excepción: también pasa por comprobante + revisión
  humana, solo que el monto esperado es `montoAbono` en vez del total.
- **Control:** solo `SEDE_STAFF`/`SEDE_ADMIN` de esa sede aprueban.
- **Control:** `AuditLog` inmutable de `pago.aprobado` / `pago.rechazado`
  (actor, antes/después, IP, timestamp).
- **Control:** monto y referencia se registran; alertas de anomalías (mismo
  comprobante para varias reservas — hash del archivo).

### 2.8d Tasa de cambio (multi-moneda)
- **Sin scraping ni API automática** — la tasa BCV se carga a mano en
  `/panel/tasa-cambio` (staff/admin), sigue la misma regla que el resto del
  dinero en este proyecto (CLAUDE.md §5). Nada llama a un sitio externo.
- **Control:** si no hay ninguna tasa cargada para la moneda de precios de
  la sede, `calcularPrecioReserva()` rechaza la reserva (`sin_tasa_cambio`)
  en vez de usar un valor por defecto o adivinar — mejor bloquear a cobrar
  con una tasa vieja/inventada sin que nadie se dé cuenta.
- **Control:** la tasa queda CONGELADA en cada `Reserva` al momento de
  reservar (`tasaCambio`, `precioTotalRef`) — no se recalcula después, así
  que un cambio de tasa nunca altera silenciosamente el precio de una
  reserva ya hecha.

### 2.9b Abono (pago parcial)
- **Nota de terminología (2026-09-13):** "abono" es la parte del total que
  el cliente paga por adelantado para confirmar una reserva larga — NO un
  crédito prepago. Ese crédito prepago existió en una pasada anterior
  (modelos `Abono`/`MovimientoAbono`, `/panel/abonos`) y se eliminó por
  completo: no corresponde a como trabajan los clubes reales. Ver CLAUDE.md
  §3 "Duración variable y pago parcial" y la nota de corrección en §10b.
- **Regla de negocio: el abono no se devuelve si cancela el cliente.**
  Cancelar significa perder lo ya abonado — sin excepción cuando cancela el
  organizador. Si cancela **staff/admin/plataforma**, el club puede optar
  por devolverlo, pero esa devolución la ejecuta el club por fuera del
  sistema (efectivo, pago móvil de vuelta) — `/api/reservas/[id]/cancelar`
  nunca acredita nada automáticamente, sigue la regla de dinero-siempre-
  manual (CLAUDE.md §5). Se avisa antes de pagar y otra vez al cancelar
  (`CancelarReserva.tsx`).
- **Control:** cancelar también rechaza cualquier comprobante `EN_REVISION`
  que haya quedado asociado, para que no aparezca en la cola de aprobación
  de una reserva que ya no existe.

### 2.10 Notificaciones / abuso de WhatsApp
- **Control:** ofertas y descuentos **nunca** por WhatsApp (Web Push / email /
  in-app). WhatsApp solo transaccional y de bajo volumen, con rate-limit propio.
- **Control:** opt-in explícito para push; endpoints de suscripción con
  rate-limit `notify`.

### 2.11 Secretos y dependencias
- **Control:** secretos solo en el gestor de Dokploy/Coolify; `.env` en
  `.gitignore`; `.env.example` sin valores reales.
- **Control:** `pnpm audit` + Dependabot/renovate; lockfile commiteado.
- **Control:** sin secretos en el bundle del cliente (solo `NEXT_PUBLIC_*`).

### 2.12 Backups / continuidad
- **Control:** `pg_dump` cifrado a Backblaze B2, diario, con prueba de restore
  mensual. MinIO replicado. Retención definida.

---

## 3. Checklist de auditoría (por release)

- [ ] `pnpm lint` sin `no-restricted-*` violado (SQL crudo, eval, innerHTML).
- [ ] Todo route handler mutante usa `withGuard` (rate-limit + Zod).
- [ ] Operaciones no idempotentes exigen `Idempotency-Key`.
- [ ] Middleware CSRF activo; probar POST cross-origin → 403.
- [ ] CSP sin `unsafe-inline`/`unsafe-eval` en prod; probar con report-only antes.
- [ ] Ningún `findFirst`/`update` de negocio sin `sedeId`.
- [ ] Endpoint de upload rechaza: archivo renombrado, polyglot, > 5 MB, SVG.
- [ ] Comprobantes no accesibles sin URL firmada; probar URL directa → 403.
- [ ] Login: 12 intentos → lockout; rate-limit por IP e identificador.
- [ ] Cookies de sesión: `HttpOnly` + `Secure` + `SameSite`.
- [ ] Headers de seguridad presentes (revisar con securityheaders.com en staging).
- [ ] `pnpm audit` sin vulnerabilidades altas/críticas sin mitigar.
- [ ] Backup restaurado con éxito en el último mes.
- [ ] Correr `/security-review` sobre el diff de la rama.

---

## 4. Reporte de vulnerabilidades

Contacto: `security@pelotea.app` (por definir). No divulgación pública hasta
parche. Se agradece disclosure responsable.
