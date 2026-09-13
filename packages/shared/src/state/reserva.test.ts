import { describe, it, expect } from 'vitest';
import {
  transicionar,
  puedeTransicionar,
  TransicionInvalidaError,
  debeGenerarLastMinute,
} from './reserva';

describe('máquina de estados de Reserva', () => {
  it('sigue el camino feliz completo', () => {
    let estado = transicionar('BORRADOR', 'INICIAR_PAGO');
    expect(estado).toBe('PENDIENTE_PAGO');
    estado = transicionar(estado, 'ENVIAR_COMPROBANTE');
    expect(estado).toBe('COMPROBANTE_ENVIADO');
    estado = transicionar(estado, 'APROBAR');
    expect(estado).toBe('CONFIRMADA');
    estado = transicionar(estado, 'COMPLETAR');
    expect(estado).toBe('COMPLETADA');
  });

  it('rechaza una decisión de aprobación tardía sobre un estado ya terminal', () => {
    expect(puedeTransicionar('COMPLETADA', 'APROBAR')).toBe(false);
    expect(() => transicionar('COMPLETADA', 'APROBAR')).toThrow(TransicionInvalidaError);
  });

  it('un rechazo devuelve la reserva a pendiente de pago, no la cancela', () => {
    expect(transicionar('EN_REVISION', 'RECHAZAR')).toBe('PENDIENTE_PAGO');
  });

  it('permite cancelar desde cualquier estado activo', () => {
    for (const desde of ['PENDIENTE_PAGO', 'COMPROBANTE_ENVIADO', 'EN_REVISION', 'CONFIRMADA'] as const) {
      expect(transicionar(desde, 'CANCELAR')).toBe('CANCELADA');
    }
  });

  it('no permite cancelar un estado terminal', () => {
    expect(puedeTransicionar('CANCELADA', 'CANCELAR')).toBe(false);
    expect(puedeTransicionar('EXPIRADA', 'CANCELAR')).toBe(false);
  });
});

describe('debeGenerarLastMinute', () => {
  const ahora = new Date('2026-09-10T12:00:00Z');

  it('genera oferta si faltan menos horas que la ventana crítica', () => {
    const inicio = new Date('2026-09-10T15:00:00Z'); // faltan 3h
    expect(debeGenerarLastMinute(inicio, ahora, 6)).toBe(true);
  });

  it('no genera oferta si falta más que la ventana crítica', () => {
    const inicio = new Date('2026-09-11T12:00:00Z'); // faltan 24h
    expect(debeGenerarLastMinute(inicio, ahora, 6)).toBe(false);
  });

  it('no genera oferta si el turno ya pasó', () => {
    const inicio = new Date('2026-09-10T10:00:00Z'); // ya pasó
    expect(debeGenerarLastMinute(inicio, ahora, 6)).toBe(false);
  });
});
