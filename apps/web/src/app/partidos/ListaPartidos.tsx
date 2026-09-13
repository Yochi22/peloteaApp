'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, BeneficiosCuenta } from '@pelotea/ui';

export interface PartidoItem {
  id: string;
  deporte: string;
  deporteLabel: string;
  nivel: string;
  inicio: string;
  fin: string;
  cuposTotales: number;
  cuposLlenos: number;
  precioPorJugador: number;
  cancha: { nombre: string; superficie: string } | null;
}

const COLOR_SUPERFICIE: Record<string, string> = {
  ARCILLA: 'var(--pl-clay)',
  ARENA: 'var(--pl-clay)',
  GRASS: 'var(--pl-grass)',
  SINTETICO: 'var(--pl-grass)',
  CANCHA_DURA: 'var(--pl-hard)',
  CRISTAL: 'var(--pl-hard)',
};

const NIVEL_LABEL: Record<string, string> = {
  PRINCIPIANTE: 'nivel principiante',
  INTERMEDIO: 'nivel intermedio',
  AVANZADO: 'nivel avanzado',
  COMPETITIVO: 'nivel competitivo',
};

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-VE', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function Tarjeta({ p, autenticado }: { p: PartidoItem; autenticado: boolean }) {
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'unido' | 'completo' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const color = p.cancha ? COLOR_SUPERFICIE[p.cancha.superficie] ?? 'var(--pl-hard)' : 'var(--pl-hard)';

  async function unirse() {
    setEstado('enviando');
    setError(null);
    try {
      const res = await fetch(`/api/partidos/${p.id}/unirse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body.error === 'partido_completo' || body.error === 'ya_estas_en_este_partido') {
          setEstado('completo');
          setError(body.error === 'partido_completo' ? 'Justo se completó.' : 'Ya estás en este partido.');
          return;
        }
        setEstado('error');
        setError('No se pudo unir. Intenta de nuevo.');
        return;
      }
      setEstado('unido');
    } catch {
      setEstado('error');
      setError('Problema de conexión.');
    }
  }

  return (
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', overflow: 'hidden', background: 'var(--pl-bg-raised)' }}>
      <div style={{ height: 6, background: color }} />
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>
              {p.deporteLabel} · {NIVEL_LABEL[p.nivel] ?? p.nivel}
            </span>
            <h3 style={{ fontSize: 17, marginTop: 4 }}>{formatoFecha(p.inicio)}</h3>
            {p.cancha ? (
              <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 2 }}>{p.cancha.nombre}</p>
            ) : null}
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <div style={{ fontWeight: 700 }}>Bs {p.precioPorJugador.toLocaleString('es-VE')}</div>
            <div style={{ fontSize: 11, color: 'var(--pl-ink-soft)' }}>c/u</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--pl-ink-soft)' }}>
            {p.cuposLlenos}/{p.cuposTotales} · {p.cuposTotales - p.cuposLlenos === 1 ? 'falta 1 jugador' : `faltan ${p.cuposTotales - p.cuposLlenos}`}
          </span>

          {estado === 'unido' ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pl-ok)' }}>¡Estás dentro!</span>
          ) : autenticado ? (
            <button
              className="pl-btn"
              style={{ padding: '8px 16px', fontSize: 13 }}
              disabled={estado === 'enviando' || estado === 'completo'}
              onClick={unirse}
            >
              {estado === 'enviando' ? '…' : 'Unirme'}
            </button>
          ) : (
            <Link className="pl-btn" style={{ padding: '8px 16px', fontSize: 13, textDecoration: 'none' }} href={`/entrar?next=/partidos`}>
              Unirme
            </Link>
          )}
        </div>
        {error ? <p style={{ fontSize: 12, color: 'var(--pl-danger)', marginTop: 6 }}>{error}</p> : null}
      </div>
    </div>
  );
}

export function ListaPartidos({ inicial, autenticado }: { inicial: PartidoItem[]; autenticado: boolean }) {
  const [items, setItems] = useState(inicial);
  const [cargando, setCargando] = useState(false);
  const [cursor, setCursor] = useState<string | null>(inicial.length >= 10 ? inicial[inicial.length - 1]?.id ?? null : null);

  async function cargarMas() {
    if (!cursor) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/partidos?cursor=${cursor}&limit=10`);
      const body = await res.json();
      setItems((prev) => [...prev, ...body.items]);
      setCursor(body.nextCursor);
    } finally {
      setCargando(false);
    }
  }

  if (items.length === 0) {
    return <Alert tone="info" title="Todavía no hay partidos abiertos">Sé el primero en crear uno.</Alert>;
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!autenticado ? <BeneficiosCuenta variant="compact" /> : null}
      {items.map((p) => (
        <Tarjeta key={p.id} p={p} autenticado={autenticado} />
      ))}
      {cursor ? (
        <button
          type="button"
          onClick={cargarMas}
          disabled={cargando}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 9, padding: '10px 16px', background: 'var(--pl-bg-raised)', fontWeight: 600, cursor: 'pointer', justifySelf: 'center' }}
        >
          {cargando ? 'Cargando…' : 'Ver más partidos'}
        </button>
      ) : null}
    </div>
  );
}
