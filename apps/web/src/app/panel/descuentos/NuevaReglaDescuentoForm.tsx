'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { Alert } from '@pelotea/ui';

const DIA_LABEL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function horaAMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const MENSAJES: Record<string, string> = {
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para esto.',
  sin_permiso: 'No tienes permiso para crear descuentos.',
  cancha_no_encontrada: 'Esa cancha ya no existe.',
  validacion: 'Revisa los datos — la hora de cierre debe ser después de la de apertura.',
};

export function NuevaReglaDescuentoForm({ canchas }: { canchas: Array<{ id: string; nombre: string; deporte: string }> }) {
  const router = useRouter();
  const [canchaId, setCanchaId] = useState(canchas[0]?.id ?? '');
  const [diaSemana, setDiaSemana] = useState<number | 'todos'>('todos');
  const [horaInicio, setHoraInicio] = useState('14:00');
  const [horaFin, setHoraFin] = useState('17:00');
  const [descuentoPct, setDescuentoPct] = useState(20);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/descuentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({
          canchaId,
          diaSemana: diaSemana === 'todos' ? null : diaSemana,
          horaInicio: horaAMinutos(horaInicio),
          horaFin: horaAMinutos(horaFin),
          descuentoPct,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo crear la regla.');
        return;
      }
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16, display: 'grid', gap: 12 }}>
      <p style={{ fontWeight: 700, fontSize: 14 }}>Programar un descuento nuevo</p>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Cancha
        <select
          value={canchaId}
          onChange={(e) => setCanchaId(e.target.value)}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        >
          {canchas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {DEPORTE_LABEL[c.deporte as Deporte]}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Día
        <select
          value={diaSemana}
          onChange={(e) => setDiaSemana(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        >
          <option value="todos">Todos los días</option>
          {DIA_LABEL.map((label, i) => (
            <option key={i} value={i}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="pl-form-grid-2" style={{ gap: 10 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Desde
          <input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Hasta
          <input
            type="time"
            value={horaFin}
            onChange={(e) => setHoraFin(e.target.value)}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Descuento (%)
        <input
          type="number"
          min={1}
          max={90}
          value={descuentoPct}
          onChange={(e) => setDescuentoPct(Number(e.target.value))}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        />
      </label>
      <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: -6 }}>
        Se aplica una hora por turno dentro de ese rango, solo dentro del horario que ya tiene configurado la
        cancha, y solo a partir de ahora — nunca sobre horas que ya pasaron ni sobre las ya reservadas.
      </p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <button className="pl-btn" type="submit" disabled={enviando || !canchaId} style={{ justifySelf: 'start' }}>
        {enviando ? 'Creando…' : 'Programar descuento'}
      </button>
    </form>
  );
}
