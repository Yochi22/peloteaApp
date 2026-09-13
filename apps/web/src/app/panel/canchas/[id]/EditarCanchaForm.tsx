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
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para esto.',
  sin_permiso: 'No tienes permiso para editar canchas.',
  duraciones_invalidas: 'La duración máxima debe ser múltiplo de la unidad de turno.',
};

export interface CanchaEditable {
  id: string;
  nombre: string;
  deporte: string;
  superficie: string;
  techada: boolean;
  capacidad: number;
  cantidad: number;
  duracionTurnoMin: number;
  duracionMaximaMin: number;
  activa: boolean;
}

export function EditarCanchaForm({ cancha }: { cancha: CanchaEditable }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(cancha.nombre);
  const [deporte, setDeporte] = useState<Deporte>(cancha.deporte as Deporte);
  const [superficie, setSuperficie] = useState<Superficie>(cancha.superficie as Superficie);
  const [techada, setTechada] = useState(cancha.techada);
  const [capacidad, setCapacidad] = useState(cancha.capacidad);
  const [cantidad, setCantidad] = useState(cancha.cantidad);
  const [duracionTurnoMin, setDuracionTurnoMin] = useState(cancha.duracionTurnoMin);
  const [duracionMaximaMin, setDuracionMaximaMin] = useState(cancha.duracionMaximaMin);
  const [activa, setActiva] = useState(cancha.activa);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  async function guardar(cambios: Record<string, unknown>) {
    setEnviando(true);
    setError(null);
    setExito(false);
    try {
      const res = await fetch(`/api/admin/canchas/${cancha.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify(cambios),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo guardar.');
        return;
      }
      setExito(true);
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    guardar({ nombre, deporte, superficie, techada, capacidad, cantidad, duracionTurnoMin, duracionMaximaMin });
  }

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 999,
            color: activa ? 'var(--pl-ok)' : 'var(--pl-ink-soft)',
            border: `1.5px solid ${activa ? 'var(--pl-ok)' : 'var(--pl-line)'}`,
          }}
        >
          {activa ? 'Activa' : 'Inactiva'}
        </span>
        <button
          type="button"
          className="pl-btn pl-btn--ghost"
          disabled={enviando}
          onClick={() => {
            const nuevo = !activa;
            setActiva(nuevo);
            guardar({ activa: nuevo });
          }}
        >
          {activa ? 'Desactivar (no acepta reservas nuevas)' : 'Activar cancha'}
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Nombre
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
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
          Bajarla no afecta reservas ya hechas — solo limita cuántas se pueden tomar a la misma hora de ahora en
          adelante.
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

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        {exito ? (
          <Alert tone="ok" live>
            Guardado.
          </Alert>
        ) : null}

        <button className="pl-btn" type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
