import { defineConfig } from '@playwright/test';

/**
 * Pruebas de abuso (CSRF, doble submit, rate-limit) sobre endpoints reales —
 * ver CLAUDE.md §8/§10b "pendiente inmediato". Corren contra un servidor
 * `next start`/`next dev` real (nunca contra el build de Vercel/Render de
 * producción) + Postgres + Redis levantados — `pnpm infra:up` primero.
 *
 * A propósito NO usan la fixture `page` (nada de navegador real): pegan
 * directo a la API con la fixture `request`, así no hace falta
 * `npx playwright install` de navegadores para correrlas.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // comparten el mismo cupo de rate-limit por IP — en paralelo se pisarían entre sí.
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
  },
});
