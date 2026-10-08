# Desplegar una demo gratis en Render

> Esto es para **demostrar el producto a clubes**, no para producción real.
> La arquitectura "de verdad" del proyecto (1 VPS + Dokploy/Coolify,
> self-hosted, sin mensualidades de plataforma) sigue siendo la de
> [`CLAUDE.md`](./CLAUDE.md) §4 — Render es un atajo gratis solo para la demo.

## Por qué no es 100% "todo Render" sin tocar nada más

Render no tiene, en su plan free:

- **Redis** (lo quitaron del free tier) — este proyecto lo necesita para
  locks de slot, rate-limit e idempotencia. Solución: **Upstash** (Redis
  serverless, plan free con ~10k comandos/día — de sobra para una demo).
- **Almacenamiento S3-compatible** (para los comprobantes) — no hay MinIO
  gestionado en Render. Solución: **Backblaze B2** (free hasta 10 GB, sin
  pedir tarjeta para la cuenta, con una API "S3 compatible" que el proyecto
  ya sabe hablar vía `@aws-sdk/client-s3`). Cloudflare R2 es la alternativa
  si prefieres esa — mismo formato de variables, solo cambia el endpoint.
- **Background Workers de verdad** — el tipo "Background Worker" de Render
  solo existe en planes pagos. Se resuelve corriendo `apps/worker` como un
  **Web Service** free más (`pelotea-worker` en `render.yaml`): le agregué
  un servidor HTTP mínimo (`apps/worker/src/lib/server.ts`) solo para que
  Render tenga un puerto al que hacerle health-check — el trabajo real
  (BullMQ, Baileys) no depende de ese HTTP. Esto SÍ corre gratis, con la
  misma limitación que el web: **se duerme tras ~15 min sin tráfico** y
  despierta con la siguiente visita/ping — para una demo, aceptable.

## Pasos

1. **Backblaze B2** (gratis, sin tarjeta): crear cuenta en backblaze.com →
   "Create a Bucket" (p.ej. `pelotea-comprobantes`, privado) → en
   "Account" → "App Keys" → "Add a New Application Key", restringido a ese
   bucket. Anotar: `keyID` (= access key), `applicationKey` (= secret key),
   y el endpoint S3 que Backblaze muestra en la vista del bucket (algo como
   `https://s3.us-west-004.backblazeb2.com` — el número de región varía).
2. **Upstash** (gratis): crear una base Redis, copiar la `REDIS_URL` (con
   `rediss://` — TLS — no `redis://`; `ioredis` detecta TLS solo por ese
   prefijo, no hace falta configurar nada más).
3. **Render** → "New +" → "Blueprint" → conectar este repo → Render lee
   [`render.yaml`](./render.yaml) y propone: una Postgres free
   (`pelotea-db`) + dos Web Services (`pelotea-web`, `pelotea-worker`).
4. Antes de confirmar el deploy, completar en el dashboard las variables
   marcadas `sync: false`:
   - En `pelotea-web`: `REDIS_URL` (de Upstash),
     `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET` (de
     Backblaze B2), y `S3_PUBLIC_ORIGIN` si se expone el bucket con dominio
     público (si no, dejar vacío — los comprobantes solo se ven por URL
     firmada, ver
     SECURITY.md §2.8).
   - En `pelotea-worker`: la misma `REDIS_URL` de Upstash, y las variables
     S3_* también (el worker las usa para borrar comprobantes viejos, ver
     más abajo).
5. Deploy. Render corre `pnpm install` → `pnpm db:generate` → build de cada
   servicio; `pelotea-web` además aplica `prisma migrate deploy` antes de
   arrancar (aplica el schema a la Postgres nueva).
6. **Crear tu club de verdad, sin seed**: abre `https://pelotea-web.onrender.com/configurar`
   — ahí creas el nombre del club, tus datos de pago móvil (opcional, se
   puede cargar después) y tu cuenta de administrador (nombre, email,
   contraseña). Esa pantalla **solo funciona la primera vez**: en cuanto
   existe una Sede, `/configurar` redirige a `/entrar` y el endpoint la
   rechaza — no hay forma de volver a usarla por error ni de que otra
   persona se cree un admin después. Te deja la sesión iniciada de una.
   (El seed genérico — `pnpm --filter @pelotea/db seed` desde la Shell de
   `pelotea-web` — sigue existiendo si algún día quieres datos de prueba
   rápidos, pero no hace falta para nada de esto.)
7. **Activar 2FA**: apenas entres, `/panel` te va a mandar directo a
   `/cuenta/2fa` — es obligatorio para `SEDE_ADMIN`/`PLATAFORMA_ADMIN`, no
   hay forma de saltárselo.
8. **Armar el inventario real** desde `/panel/canchas`: crear cada cancha
   (deporte, superficie, capacidad, duración de turno) y configurarle el
   horario semanal con su tarifa — nace sin horario, así que no acepta
   reservas hasta que la configures.
9. **Cargar la tasa de cambio** en `/panel/tasa-cambio` si vas a fijar
   tarifas en USD/EUR (`Sede.precioMoneda`, elegible en
   `/panel/configuracion`) — si no, nadie puede reservar.

## Limitaciones a tener presentes en la demo

- Ambos servicios (`pelotea-web` y `pelotea-worker`) se **duermen tras
  ~15 min sin tráfico** en el plan free — la primera visita/mensaje después
  de eso tarda unos segundos en "despertar". Normal, no es un error.
- La Postgres free de Render **expira a los 90 días** si no se pasa a un
  plan pago — bien para una demo puntual, no para dejarla corriendo meses.
- **El sleep de `pelotea-worker` afecta a TODO lo que corre ahí**: mientras
  está dormido, ningún barrido corre — ni la expiración de HOLDs, ni el
  despacho de ofertas, ni las limpiezas periódicas. Todo se pone al día
  recién cuando algo despierta al worker. Para una demo puntual es
  aceptable; si molesta, la solución gratis de siempre es un "pinger"
  externo (p.ej. [UptimeRobot](https://uptimerobot.com) o
  [cron-job.org](https://cron-job.org), ambos gratis) pegándole a
  `https://pelotea-worker.onrender.com/health` cada 5-10 minutos para que
  nunca llegue a dormirse — no hace falta tocar código, se configura desde
  el panel de esos servicios. En producción real (VPS propio, CLAUDE.md
  §4) esto no aplica: el worker nunca se duerme.
