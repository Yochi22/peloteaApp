'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { DEPORTES, DEPORTE_LABEL, SUPERFICIES, SUPERFICIE_LABEL, type Deporte, type Superficie } from '@pelotea/shared';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para crear canchas.',
  sin_permiso: 'No tienes permiso para crear canchas.',
  validacion: 'Revisa los datos — algo no es válido.',
};

export function NuevaCanchaForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [deporte, setDeporte] = useState<Deporte>('PADEL');
  const [superficie, setSuperficie] = useState<Superficie>('CANCHA_DURA');
  const [techada, setTechada] = useState(false);
  const [capacidad, setCapacidad] = useState(4);
  const [cantidad, setCantidad] = useState(1);
  const [duracionTurnoMin, setDuracionTurnoMin] = useState(60);
  const [duracionMaximaMin, setDuracionMaximaMin] = useState(180);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/canchas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ nombre, deporte, superficie, techada, capacidad, cantidad, duracionTurnoMin, duracionMaximaMin }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo crear la cancha.');
        return;
      }
      router.push(`/panel/canchas/${body.id}`);
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 22, display: 'grid', gap: 14 }}>
      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Nombre
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Cancha 1"
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        />
      </label>

      <div className="pl-form-grid-2" style={{ gap: 10 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Deporte
          <select
            value={deporte}
            onChange={(e) => setDeporte(e.target.value as Deporte)}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          >
            {DEPORTES.map((d) => (
              <option key={d} value={d}>
                {DEPORTE_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Superficie
          <select
            value={superficie}
            onChange={(e) => setSuperficie(e.target.value as Superficie)}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          >
            {SUPERFICIES.map((s) => (
              <option key={s} value={s}>
                {SUPERFICIE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
        <input type="checkbox" checked={techada} onChange={(e) => setTechada(e.target.checked)} />
        Techada
      </label>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Capacidad (jugadores)
        <input
          type="number"
          min={1}
          max={60}
          value={capacidad}
          onChange={(e) => setCapacidad(Number(e.target.value))}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        />
      </label>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Cantidad de canchas idénticas
        <input
          type="number"
          min={1}
          max={50}
          value={cantidad}
          onChange={(e) => setCantidad(Number(e.target.value))}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        />
      </label>
      <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: -6 }}>
        Si tienes varias canchas idénticas para esta disciplina (ej. 6 canchas de vóley playa), pon esa cantidad
        acá en vez de crear una fila por cada una — al cliente no le importa cuál específica, solo que haya cupo.
        Asignas la cancha física cuando la gente llega.
      </p>

      <div className="pl-form-grid-2" style={{ gap: 10 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Unidad de turno (min)
          <input
            type="number"
            min={15}
            max={240}
            step={15}
            value={duracionTurnoMin}
            onChange={(e) => setDuracionTurnoMin(Number(e.target.value))}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Duración máxima (min)
          <input
            type="number"
            min={15}
            max={480}
            step={15}
            value={duracionMaximaMin}
            onChange={(e) => setDuracionMaximaMin(Number(e.target.value))}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
      </div>
      <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: -6 }}>
        Ej: unidad de 60 min y máximo de 180 min = se puede reservar 1h, 2h o 3h. La máxima debe ser múltiplo de
        la unidad.
      </p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <button className="pl-btn" type="submit" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear cancha'}
      </button>
    </form>
  );
}
