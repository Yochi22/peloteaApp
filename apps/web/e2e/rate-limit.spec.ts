import { test, expect } from '@playwright/test';
import { canchaDePrueba, horarioValidoISO, invitadoDePrueba, limpiarRateLimit } from './helpers';

/**
 * `guestBooking` (packages/security/rate-limit.ts): 5 reservas por hora por
 * IP. Más estricto que `mutation` a propósito — reservar sin cuenta crea un
 * Usuario nuevo Y toma un HOLD real sin ninguna verificación previa, así
 * que sin este tope alguien podría acaparar la agenda entera de un club sin
 * siquiera registrarse.
 */
test.describe('Abuso: rate-limit de reservar como invitado', () => {
  test('el sexto intento en la misma hora devuelve 429', async ({ request, baseURL }) => {
    await limpiarRateLimit('guestBooking');
    await request.get('/canchas');
    const state = await request.storageState();
    const csrf = state.cookies.find((c) => c.name === 'pl_csrf')!.value;
    const cancha = await canchaDePrueba();
    const headers = { origin: baseURL!, 'x-csrf-token': csrf };

    const estados: number[] = [];
    for (let i = 0; i < 6; i++) {
      // Un horario distinto por intento — lo que se está probando es CUÁNTOS
      // intentos deja hacer el mismo IP, no si un horario puntual ya está tomado.
      const inicio = new Date(horarioValidoISO());
      inicio.setHours(inicio.getHours() + i);
      const res = await request.post('/api/reservas', {
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
        data: { canchaId: cancha.id, inicioISO: inicio.toISOString(), invitado: invitadoDePrueba() },
      });
      estados.push(res.status());
    }

    expect(estados.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(estados[5]).toBe(429);
  });
});
