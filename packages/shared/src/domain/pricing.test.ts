import { describe, it, expect } from 'vitest';
import { calcularPrecio, dividirEnCuotas } from './pricing';

describe('calcularPrecio', () => {
  it('calcula el precio base proporcional a la duración', () => {
    const r = calcularPrecio({
      precioBaseHora: 560,
      duracionMin: 90,
      inicio: new Date('2026-09-10T10:00:00'), // jueves, fuera de peak
      reglas: [],
    });
    expect(r.precioBase).toBeCloseTo(840);
    expect(r.total).toBeCloseTo(840);
  });

  it('aplica un recargo porcentual solo dentro de la franja de la regla', () => {
    const reglas = [
      {
        diaSemana: null,
        horaDesde: 18 * 60,
        horaHasta: 22 * 60,
        tipoModificador: 'PORCENTAJE' as const,
        valor: 25,
        prioridad: 10,
        activa: true,
      },
    ];

    const enPeak = calcularPrecio({
      precioBaseHora: 560,
      duracionMin: 90,
      inicio: new Date('2026-09-10T19:00:00'),
      reglas,
    });
    expect(enPeak.total).toBeCloseTo(840 * 1.25);

    const fueraDePeak = calcularPrecio({
      precioBaseHora: 560,
      duracionMin: 90,
      inicio: new Date('2026-09-10T10:00:00'),
      reglas,
    });
    expect(fueraDePeak.total).toBeCloseTo(840);
  });

  it('aplica el descuento de una oferta después de las reglas de precio', () => {
    const r = calcularPrecio({
      precioBaseHora: 560,
      duracionMin: 90,
      inicio: new Date('2026-09-10T10:00:00'),
      reglas: [],
      descuentoOfertaPct: 25,
      montoServicio: 20,
    });
    expect(r.subtotal).toBeCloseTo(840 * 0.75);
    expect(r.total).toBeCloseTo(840 * 0.75 + 20);
  });

  it('nunca deja el subtotal negativo', () => {
    const r = calcularPrecio({
      precioBaseHora: 100,
      duracionMin: 60,
      inicio: new Date('2026-09-10T10:00:00'),
      reglas: [
        { diaSemana: null, horaDesde: null, horaHasta: null, tipoModificador: 'MONTO_FIJO', valor: -500, prioridad: 0, activa: true },
      ],
    });
    expect(r.subtotal).toBe(0);
  });
});

describe('dividirEnCuotas', () => {
  it('divide un monto exacto entre partes iguales', () => {
    expect(dividirEnCuotas(800, 4)).toEqual([200, 200, 200, 200]);
  });

  it('asigna el resto de centavos al primer participante (el organizador)', () => {
    const cuotas = dividirEnCuotas(100, 3);
    const suma = cuotas.reduce((a, b) => a + b, 0);
    expect(Math.round(suma * 100) / 100).toBe(100);
    expect(cuotas[0]).toBeGreaterThanOrEqual(cuotas[1]!);
  });

  it('rechaza menos de un participante', () => {
    expect(() => dividirEnCuotas(100, 0)).toThrow();
  });
});
