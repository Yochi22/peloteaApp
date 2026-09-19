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
    // Sin definir por defecto a propósito: el partido se crea para una
    // categoría, no una cancha puntual — el club asigna la cancha física
    // del pool cuando el organizador confirma y paga.
    canchaId: '',
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

      {canchas.some((c) => c.deporte === form.deporte) ? (
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Cancha específica (opcional — normalmente se deja "sin definir": el club asigna una cancha libre de esta
          disciplina cuando confirmes y pagues)
          <select value={form.canchaId} onChange={(e) => setForm({ ...form, canchaId: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}>
            <option value="">Sin definir todavía</option>
            {/* Solo canchas de la disciplina elegida arriba — mostrar todas
                sin filtrar confundía (ej. elegir una cancha de fútbol con
                deporte=pádel). */}
            {canchas
              .filter((c) => c.deporte === form.deporte)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </label>
      ) : null}

      <div className="pl-form-grid-2" style={{ gap: 12 }}>
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

      <div className="pl-form-grid-2" style={{ gap: 12 }}>
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

      <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>
        Publicar el partido no reserva ninguna cancha todavía. Cuando se llenen los cupos, te toca a ti confirmar y
        pagar — ahí se revisa si sigue habiendo una cancha libre de esta disciplina a esta hora. Si ya no queda
        ninguna, el partido no se puede jugar en ese horario y hay que avisarle al grupo.
      </p>

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
