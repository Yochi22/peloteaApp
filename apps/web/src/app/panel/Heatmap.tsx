import { Fragment } from 'react';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const BANDAS: Array<[number, number]> = [
  [6, 9],
  [9, 12],
  [12, 15],
  [15, 18],
  [18, 21],
  [21, 24],
];

/** Mapa de calor día × franja horaria. `datos` viene de `calcularMetricas()`. */
export function Heatmap({ datos }: { datos: Array<{ dia: number; hora: number; total: number }> }) {
  const porCelda = new Map<string, number>();
  for (const d of datos) porCelda.set(`${d.dia}-${d.hora}`, d.total);

  const totales: number[][] = BANDAS.map(([desde, hasta]) =>
    Array.from({ length: 7 }, (_, dia) => {
      let suma = 0;
      for (let h = desde; h < hasta; h++) suma += porCelda.get(`${dia}-${h}`) ?? 0;
      return suma;
    }),
  );
  const max = Math.max(1, ...totales.flat());

  function color(v: number): string {
    const t = v / max; // 0..1
    if (t === 0) return 'var(--pl-bg-sunken)';
    // Rampa hueso → clay usando la variable de acento como destino.
    const luz = 92 - t * 55; // 92% (claro) → 37% (oscuro)
    return `oklch(${luz}% ${0.03 + t * 0.12} 40)`;
  }

  return (
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16, background: 'var(--pl-bg-raised)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(7, 1fr)', gap: 5, fontSize: 11, color: 'var(--pl-ink-soft)' }}>
        <span />
        {DIAS.map((d) => (
          <span key={d} style={{ textAlign: 'center', fontWeight: 700 }}>
            {d}
          </span>
        ))}
        {BANDAS.map(([desde, hasta], i) => (
          <Fragment key={desde}>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              {desde}–{hasta}h
            </span>
            {totales[i]!.map((v, dia) => (
              <span
                key={`${desde}-${dia}`}
                title={`${v} reserva${v === 1 ? '' : 's'}`}
                style={{ height: 30, borderRadius: 5, background: color(v) }}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 11, color: 'var(--pl-ink-soft)' }}>
        <span>Vacío</span>
        <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, var(--pl-bg-sunken), oklch(60% 0.1 40), oklch(37% 0.15 40))' }} />
        <span>Lleno</span>
      </div>
    </div>
  );
}
