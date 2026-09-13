'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Pagination } from '@pelotea/ui';

export interface ReservaFila {
  id: string;
  cancha: string;
  persona: string;
  esInvitado: boolean;
  inicio: string;
  estado: string;
  monto: number;
  esDividida: boolean;
  motivoCancelacion: string | null;
}

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const ESTADO_LABEL: Record<string, { texto: string; tono: string }> = {
  CONFIRMADA: { texto: 'Confirmada', tono: 'var(--pl-ok)' },
  COMPLETADA: { texto: 'Jugada', tono: 'var(--pl-ink-soft)' },
  NO_SHOW: { texto: 'No llegó', tono: 'var(--pl-danger)' },
  CANCELADA: { texto: 'Cancelada', tono: 'var(--pl-danger)' },
};

function Fila({ r, onCambio }: { r: ReservaFila; onCambio: (id: string, estado: string) => void }) {
  const [enviando, setEnviando] = useState<'no-show' | 'cancelar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const yaEmpezo = new Date(r.inicio) <= new Date();

  async function llamar(accion: 'marcar-no-show' | 'cancelar', body: unknown = {}) {
    setEnviando(accion === 'marcar-no-show' ? 'no-show' : 'cancelar');
    setError(null);
    try {
      const res = await fetch(`/api/reservas/${r.id}/${accion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify(body),
      });
      const resBody = await res.json();
      if (!res.ok) {
        setError(resBody.error ?? 'No se pudo completar la acción.');
        return;
      }
      onCambio(r.id, resBody.estado);
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(null);
    }
  }

  const info = ESTADO_LABEL[r.estado] ?? { texto: r.estado, tono: 'var(--pl-ink-soft)' };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1.5px solid var(--pl-line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontWeight: 700 }}>
            <Link href={`/panel/reservas/${r.id}`}>{r.persona}</Link>{' '}
            {r.esInvitado ? <span style={{ fontSize: 11, color: 'var(--pl-ink-soft)', fontWeight: 500 }}>(invitado)</span> : null}
            {r.esDividida ? <span style={{ fontSize: 11, color: 'var(--pl-hard)', fontWeight: 700, marginLeft: 6 }}>SPLIT</span> : null}
          </p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
            {r.cancha} · {new Date(r.inicio).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} · Bs{' '}
            {r.monto.toLocaleString('es-VE')}
          </p>
          {r.estado === 'CANCELADA' && r.motivoCancelacion ? (
            <p style={{ fontSize: 11, color: 'var(--pl-danger)', marginTop: 2 }}>{r.motivoCancelacion}</p>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: info.tono }}>{info.texto}</span>
          {r.estado === 'CONFIRMADA' && yaEmpezo ? (
            <button
              type="button"
              disabled={!!enviando}
              onClick={() => llamar('marcar-no-show')}
              style={{ border: '1.5px solid var(--pl-danger)', color: 'var(--pl-danger)', background: 'transparent', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              {enviando === 'no-show' ? '…' : 'No llegó'}
            </button>
          ) : null}
          {r.estado === 'CONFIRMADA' ? (
            <button
              type="button"
              disabled={!!enviando}
              onClick={() => llamar('cancelar', { motivo: 'Cancelada por el club' })}
              style={{ border: '1.5px solid var(--pl-line)', background: 'transparent', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {enviando === 'cancelar' ? '…' : 'Cancelar'}
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <div style={{ marginTop: 8 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}
    </div>
  );
}

export function ListaReservas({ reservas, pagina, totalPaginas }: { reservas: ReservaFila[]; pagina: number; totalPaginas: number }) {
  const router = useRouter();
  const [items, setItems] = useState(reservas);

  if (items.length === 0) {
    return <Alert tone="info">Todavía no hay reservas confirmadas.</Alert>;
  }

  return (
    <div>
      {items.map((r) => (
        <Fila key={r.id} r={r} onCambio={(id, estado) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, estado } : x)))} />
      ))}
      {totalPaginas > 1 ? (
        <div style={{ marginTop: 16 }}>
          <Pagination page={pagina} totalPages={totalPaginas} onChange={(p) => router.push(`/panel/reservas?pagina=${p}`)} />
        </div>
      ) : null}
    </div>
  );
}
