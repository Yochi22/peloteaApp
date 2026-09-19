import { test, expect } from '@playwright/test';
import { canchaDePrueba, horarioValidoISO, invitadoDePrueba, limpiarRateLimit } from './helpers';

/**
 * CSRF (middleware.ts): Origin/Referer allowlist + token double-submit
 * (`pl_csrf` cookie reflejado en el header `x-csrf-token`). Corre ANTES que
 * cualquier route handler — así que hasta un body basura debe rechazarse
 * con 403 sin llegar nunca a tocar la base.
 */
test.describe('Abuso: CSRF en POST /api/reservas', () => {
  const bodyBasura = { canchaId: 'x', inicioISO: new Date().toISOString(), invitado: { nombre: 'a', telefono: '0414-123-4567' } };

  test('sin Origin/Referer y sin token → 403', async ({ request }) => {
    const res = await request.post('/api/reservas', { data: bodyBasura });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe('csrf');
  });

  test('con Origin permitido pero sin token CSRF → 403', async ({ request, baseURL }) => {
    const res = await request.post('/api/reservas', { headers: { origin: baseURL! }, data: bodyBasura });
    expect(res.status()).toBe(403);
  });

  test('con Origin permitido y cookie sembrada, pero header no coincide → 403', async ({ request, baseURL }) => {
    await request.get('/canchas'); // siembra la cookie pl_csrf (la pone el middleware en cualquier GET si falta)
    const res = await request.post('/api/reservas', {
      headers: { origin: baseURL!, 'x-csrf-token': 'valor-que-no-coincide-con-la-cookie' },
      data: bodyBasura,
    });
    expect(res.status()).toBe(403);
  });

  test('con Origin no permitido (aunque el token sí coincida) → 403', async ({ request }) => {
    await request.get('/canchas');
    const state = await request.storageState();
    const csrf = state.cookies.find((c) => c.name === 'pl_csrf')?.value;
    const res = await request.post('/api/reservas', {
      headers: { origin: 'https://sitio-atacante.example', 'x-csrf-token': csrf ?? '' },
      data: bodyBasura,
    });
    expect(res.status()).toBe(403);
  });

  test('control positivo: Origin permitido + token reflejado correctamente pasa el chequeo CSRF', async ({ request, baseURL }) => {
    // Si este también diera 403, las pruebas de arriba no probarían nada —
    // necesitamos un caso que sí llegue al route handler para confirmar que
    // la diferencia es de verdad el CSRF y no, por ejemplo, un baseURL mal
    // configurado.
    await limpiarRateLimit('guestBooking');
    await request.get('/canchas');
    const state = await request.storageState();
    const csrf = state.cookies.find((c) => c.name === 'pl_csrf')!.value;
    const cancha = await canchaDePrueba();

    const res = await request.post('/api/reservas', {
      headers: { origin: baseURL!, 'x-csrf-token': csrf, 'idempotency-key': crypto.randomUUID() },
      data: { canchaId: cancha.id, inicioISO: horarioValidoISO(), invitado: invitadoDePrueba() },
    });
    expect(res.status()).not.toBe(403);
    expect(res.status()).toBe(201);
  });
});
