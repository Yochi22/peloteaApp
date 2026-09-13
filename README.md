# Pelotea

Software web de reservas para complejos deportivos en Venezuela (tenis, pádel,
beach tennis, vóley playa, fútbol). Reserva en línea + pago móvil manual con
aprobación del club, recuperación de ingresos (ofertas exprés y de última hora),
split de pago con amigos, matchmaking de jugadores y panel de analytics.

- Visión, dominio y arquitectura: **[`CLAUDE.md`](./CLAUDE.md)**
- Seguridad (modelo de amenazas + checklist): **[`SECURITY.md`](./SECURITY.md)**
- Concepto visual: [design canvas](https://claude.ai/code/artifact/28aba4c6-7bc2-4382-a0de-3258111111b7)
  (fuentes `*.dc.html` + `canvas.json`)

## Stack

Next.js 15 · TypeScript · PostgreSQL + Prisma · Redis (BullMQ) · MinIO ·
monorepo pnpm + Turborepo. Self-hosted en 1 VPS con Dokploy/Coolify.

## Estructura

```
apps/web       Next.js (App Router) — front + API
apps/worker    BullMQ — timers, ofertas, notificaciones, WhatsApp (Baileys)
packages/db        Prisma schema + cliente + seed
packages/shared    Zod, máquinas de estado, pricing, constantes
packages/security  headers/CSP, rate-limit, idempotency, csrf, upload-guard
packages/ui        design tokens + componentes (Alert, Pagination)
infra/         docker-compose (Postgres + Redis + MinIO)
```

## Arranque local

```bash
corepack enable pnpm
pnpm install
pnpm infra:up
cp .env.example .env      # completar secretos
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev                  # web en http://localhost:3000
```

## Convenciones

- Español de Venezuela (tuteo, sin voseo).
- `guard()` en todo route handler mutante (rate-limit + Zod + idempotencia).
- Prohibido SQL crudo sin parametrizar (ESLint lo bloquea).
- Conventional Commits; ramas de feature; `/security-review` antes de mergear.
