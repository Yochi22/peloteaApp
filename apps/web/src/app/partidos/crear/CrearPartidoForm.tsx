'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const NIVELES = [
  { value: 'PRINCIPIANTE', label: 'Principiante' },
  { value: 'INTERMEDIO', label: 'Intermedio' },
  { value: 'AVANZADO', label: 'Avanzado' },
  { value: 'COMPETITIVO', label: 'Competitivo' },
];

export function CrearPartidoForm({
  canchas,
  deportes,
}: {
  canchas: Array<{ id: string; nombre: string; deporte: string }>;
  deportes: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    canchaId: canchas[0]?.id ?? '',
    deporte: deportes[0]?.value ?? 'PADEL',
    nivel: 'INTERMEDIO',
    fecha: '',
    hora: '',
    duracionMin: 90,
    cuposTotales: 4,
    precioPorJugador: 150,
    notas: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fecha || !form.hora) {
      setError('Elige fecha y hora.');
      return;
    }
    const inicio = new Date(`${form.fecha}T${form.hora}:00`);
    const fin = new Date(inicio.getTime() + form.duracionMin * 60_000);

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/partidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({
          canchaId: form.canchaId || undefined,
          deporte: form.deporte,
          nivel: form.nivel,
          inicioISO: inicio.toISOString(),
          finISO: fin.toISOString(),
          cuposTotales: form.cuposTotales,
          precioPorJugador: form.precioPorJugador,
          notas: form.notas || undefined,
        }),
      });
      if (!res.ok) {
        setError('No se pudo crear el partido. Revisa los datos.');
        return;
      }
      router.push('/partidos');
    } catch {
      setError('Problema de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 20 }}>
      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Deporte
        <select value={form.deporte} onChange={(e) => setForm({ ...form, deporte: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}>
          {deportes.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      {canchas.length > 0 ? (
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Cancha (opcional — se puede reservar después)
          <select value={form.canchaId} onChange={(e) => setForm({ ...form, canchaId: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}>
            <option value="">Sin definir todavía</option>
            {canchas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Fecha
          <input type="date" required value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }} />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Hora
          <input type="time" required value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }} />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Nivel
        <select value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}>
          {NIVELES.map((n) => (
            <option key={n.value} value={n.value}>
              {n.label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Cupos totales
          <input type="number" min={2} max={12} value={form.cuposTotales} onChange={(e) => setForm({ ...form, cuposTotales: Number(e.target.value) })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }} />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Bs por jugador
          <input type="number" min={0} value={form.precioPorJugador} onChange={(e) => setForm({ ...form, precioPorJugador: Number(e.target.value) })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }} />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Notas (opcional)
        <textarea maxLength={280} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit', resize: 'vertical', minHeight: 60 }} />
      </label>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <button className="pl-btn" type="submit" disabled={enviando}>
        {enviando ? 'Creando…' : 'Publicar partido'}
      </button>
    </form>
  );
}
