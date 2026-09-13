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
   - En `pelotea-worker`: la misma `REDIS_URL` de Upstash, y
     `WHATSAPP_ADMIN_NUMBER` (el número del club, formato venezolano).
     `WHATSAPP_QR_TOKEN` se genera solo (`generateValue: true`) — es el
     token que hace falta para ver el QR, ver paso 6.
5. Deploy. Render corre `pnpm install` → `pnpm db:generate` → build de cada
   servicio; `pelotea-web` además aplica `prisma migrate deploy` antes de
   arrancar (aplica el schema a la Postgres nueva).
6. **Vincular WhatsApp**: abrir
   `https://pelotea-worker.onrender.com/qr?token=<WHATSAPP_QR_TOKEN>`
   (copiar el token real de las variables de entorno del servicio en el
   dashboard de Render) — muestra el QR como imagen. Escanearlo desde
   WhatsApp del número del club (Dispositivos vinculados → Vincular un
   dispositivo). Si tarda en aparecer, esperar unos segundos y recargar —
   Baileys tarda un poco en generar el primer QR al arrancar.
   - **Ojo con el sleep**: si el servicio se durmió y Render reconstruye el
     contenedor al despertar, la sesión guardada en disco (`/tmp` — no hay
     disco persistente en el free) se pierde y hay que volver a escanear.
     Para una demo puntual no es grave; si molesta, conviene un disco
     persistente (plan pago) o simplemente aceptar re-vincular de vez en
     cuando.
7. **Seed inicial**: Render Blueprint no corre el seed solo. Desde la Shell
   del servicio `pelotea-web` en el dashboard de Render, correr una vez:
   ```bash
   pnpm --filter @pelotea/db seed
   ```
   Esto crea la sede piloto, canchas de ejemplo, usuarios de prueba
   (`admin@pelotea.app`, `club@pelotea.app`, `jugador@pelotea.app` — sin
   password hasta que entres por `/registrarse` o completes cuenta) y la
   tasa de cambio del día. En vez del seed genérico, también se puede armar
   el inventario real desde `/panel/canchas`.
8. **Activar 2FA** en la cuenta admin (`/cuenta/2fa`) antes de mostrar el
   panel a nadie — `SEDE_ADMIN`/`PLATAFORMA_ADMIN` lo exigen para entrar.
9. **Cargar la tasa de cambio** en `/panel/tasa-cambio` si la sede de demo
   fija precios en USD/EUR (`Sede.precioMoneda`, configurable en
   `/panel/configuracion`) — si no, nadie puede reservar.

## Limitaciones a tener presentes en la demo

- Ambos servicios (`pelotea-web` y `pelotea-worker`) se **duermen tras
  ~15 min sin tráfico** en el plan free — la primera visita/mensaje después
  de eso tarda unos segundos en "despertar". Normal, no es un error.
- La Postgres free de Render **expira a los 90 días** si no se pasa a un
  plan pago — bien para una demo puntual, no para dejarla corriendo meses.
- Sin disco persistente, la sesión de WhatsApp puede pedir re-vincularse
  después de un sleep largo (ver paso 6).
