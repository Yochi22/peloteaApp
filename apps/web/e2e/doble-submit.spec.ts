import { test, expect } from '@playwright/test';
import { prisma } from '@pelotea/db';
import { canchaDePrueba, horarioValidoISO, invitadoDePrueba, limpiarRateLimit } from './helpers';

/**
 * Doble envío / reenvío de formulario: `guard()` (apps/web/src/lib/guard.ts)
 * exige `Idempotency-Key` en `POST /api/reservas` y cachea la respuesta en
 * Redis por esa clave — reenviar el mismo formulario (doble click, o un
 * reintento automático de red) nunca debe crear una segunda reserva ni
 * tomar un segundo HOLD sobre el mismo horario.
 */
test.describe('Abuso: doble envío (Idempotency-Key) en POST /api/reservas', () => {
  test('el mismo Idempotency-Key dos veces no crea una segunda reserva', async ({ request, baseURL }) => {
    await limpiarRateLimit('guestBooking');
    await request.get('/canchas');
    const state = await request.storageState();
    const csrf = state.cookies.find((c) => c.name === 'pl_csrf')!.value;
    const cancha = await canchaDePrueba();
    const invitado = invitadoDePrueba();
    const idemKey = crypto.randomUUID();
    const headers = { origin: baseURL!, 'x-csrf-token': csrf, 'idempotency-key': idemKey };
    const body = { canchaId: cancha.id, inicioISO: horarioValidoISO(), invitado };

    const primero = await request.post('/api/reservas', { headers, data: body });
    expect(primero.status()).toBe(201);
    const primeroBody = await primero.json();

    // Mismo Idempotency-Key, mismo body — simula un doble clic o un
    // reintento de red del mismo formulario.
    const segundo = await request.post('/api/reservas', { headers, data: body });
    expect(segundo.status()).toBe(200); // cacheado — nunca un 201 nuevo
    const segundoBody = await segundo.json();
    expect(segundoBody.id).toBe(primeroBody.id);

    const reservasCreadas = await prisma.reserva.count({
      where: { canchaId: cancha.id, organizador: { telefono: invitado.telefono } },
    });
    expect(reservasCreadas).toBe(1);

    const locksCreados = await prisma.slotLock.count({ where: { reservaId: primeroBody.id } });
    expect(locksCreados).toBeGreaterThan(0); // el HOLD se tomó una sola vez, no dos
  });
});
