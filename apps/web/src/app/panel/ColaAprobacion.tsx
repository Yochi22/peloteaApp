'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Pagination } from '@pelotea/ui';

export interface PagoPendiente {
  pagoId: string;
  cuotaId: string | null;
  monto: number;
  referencia: string | null;
  creadoEn: string;
  persona: string;
  cancha: string;
  inicio: string | null;
  /** true si es la cuota de un split; false si es la reserva completa. */
  esSplit: boolean;
}

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function Fila({ p, onResuelto }: { p: PagoPendiente; onResuelto: () => void }) {
  const [enviando, setEnviando] = useState<'aprobar' | 'rechazar' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlComprobante, setUrlComprobante] = useState<string | null>(null);

  async function verComprobante() {
    if (urlComprobante) {
      window.open(urlComprobante, '_blank', 'noopener,noreferrer');
      return;
    }
    const res = await fetch(`/api/pagos/${p.pagoId}/comprobante-url`);
    const body = await res.json();
    if (res.ok) {
      setUrlComprobante(body.url);
      window.open(body.url, '_blank', 'noopener,noreferrer');
    }
  }

  async function resolver(decision: 'APROBAR' | 'RECHAZAR') {
    setEnviando(decision === 'APROBAR' ? 'aprobar' : 'rechazar');
    setError(null);
    try {
      const endpoint = p.esSplit ? `/api/cuotas/${p.cuotaId}/resolver` : `/api/pagos/${p.pagoId}/resolver`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          'x-csrf-token': leerCookie('pl_csrf') ?? '',
        },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'No se pudo procesar.');
        return;
      }
      onResuelto();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ fontWeight: 700 }}>
            {p.persona} · Bs {p.monto.toLocaleString('es-VE')}
            {p.esSplit ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pl-hard)', marginLeft: 6 }}>SPLIT</span> : null}
          </p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2 }}>
            {p.cancha}
            {p.inicio ? ` · ${new Date(p.inicio).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
            {p.referencia ? ` · ref. ${p.referencia}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={verComprobante}
          style={{ flex: 'none', border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, background: 'var(--pl-bg-raised)', cursor: 'pointer', height: 32 }}
        >
          Ver comprobante
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 8 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          disabled={!!enviando}
          onClick={() => resolver('APROBAR')}
          style={{ flex: 1, background: 'var(--pl-ok)', color: '#fff', border: 0, borderRadius: 7, padding: '8px 0', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {enviando === 'aprobar' ? '…' : 'Aprobar'}
        </button>
        <button
          type="button"
          disabled={!!enviando}
          onClick={() => resolver('RECHAZAR')}
          style={{ flex: 1, background: 'transparent', border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '8px 0', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          {enviando === 'rechazar' ? '…' : 'Rechazar'}
        </button>
      </div>
    </div>
  );
}

export function ColaAprobacion({
  pendientes,
  pagina,
  totalPaginas,
}: {
  pendientes: PagoPendiente[];
  pagina: number;
  totalPaginas: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(pendientes);

  // `useState(pendientes)` solo lee el prop al montar — sin esto, el
  // auto-refresco del panel (ver AutoRefresh.tsx) refresca los datos del
  // servidor pero esta lista se quedaba congelada con lo que había al
  // cargar la página. Se sincroniza cada vez que el padre trae datos
  // nuevos (mismo criterio que ComprobanteForm en /reservas/[id]/comprobante).
  useEffect(() => setItems(pendientes), [pendientes]);

  if (items.length === 0) {
    return <Alert tone="ok">No hay pagos pendientes por revisar.</Alert>;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map((p) => (
        <Fila key={p.pagoId} p={p} onResuelto={() => setItems((prev) => prev.filter((x) => x.pagoId !== p.pagoId))} />
      ))}

      {totalPaginas > 1 ? (
        <div style={{ marginTop: 6 }}>
          <Pagination page={pagina} totalPages={totalPaginas} onChange={(p) => router.push(`/panel?pagina=${p}`)} />
        </div>
      ) : null}
    </div>
  );
}
