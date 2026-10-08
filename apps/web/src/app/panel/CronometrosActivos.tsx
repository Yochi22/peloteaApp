import Link from 'next/link';
import { Cronometro } from './Cronometro';

export interface CronometroActivo {
  reservaId: string;
  persona: string;
  cancha: string;
  inicio: string;
  fin: string;
  tiempoIniciadoEn: string;
}

/**
 * Todos los cronómetros de hoy ya iniciados, en un solo lugar — antes había
 * que entrar reserva por reserva (o a la agenda) para ver cada cuenta
 * regresiva. El aviso de "se acabó" es puramente visual (cada
 * `<Cronometro>` se pone en rojo solo, en vivo) — no hay ningún worker
 * mandando una alerta aparte; si nadie tiene el panel abierto en ese
 * momento, no hay forma de avisar (decisión explícita: no vale la pena un
 * canal push solo para esto).
 */
export function CronometrosActivos({ items }: { items: CronometroActivo[] }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((it) => (
        <div key={it.reservaId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 12, flexWrap: 'wrap' }}>
          <div>
            <Link href={`/panel/reservas/${it.reservaId}`} style={{ fontWeight: 700, fontSize: 14 }}>
              {it.persona}
            </Link>
            <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>{it.cancha}</p>
          </div>
          <Cronometro reservaId={it.reservaId} inicio={it.inicio} fin={it.fin} tiempoIniciadoEn={it.tiempoIniciadoEn} />
        </div>
      ))}
    </div>
  );
}
