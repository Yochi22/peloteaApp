'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { DEPORTE_LABEL, type Deporte } from '@pelotea/shared';
import { Alert } from '@pelotea/ui';

const TIPO_LABEL: Record<string, string> = {
  CIERRE: 'Cierre / feriado',
  MANTENIMIENTO: 'Mantenimiento',
  TORNEO: 'Torneo',
  HORARIO_ESPECIAL: 'Horario especial',
};

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
  sin_permiso: 'No tienes permiso para esto.',
  cancha_no_encontrada: 'Esa cancha ya no existe.',
  validation: 'Revisa los datos — si pones hora, la de fin debe ser después de la de inicio.',
};

export function NuevaExcepcionForm({ canchas }: { canchas: Array<{ id: string; nombre: string; deporte: string }> }) {
  const router = useRouter();
  const [canchaId, setCanchaId] = useState<'todas' | string>('todas');
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState<'CIERRE' | 'MANTENIMIENTO' | 'TORNEO' | 'HORARIO_ESPECIAL'>('CIERRE');
  const [diaCompleto, setDiaCompleto] = useState(true);
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFin, setHoraFin] = useState('22:00');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fecha) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/excepciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({
          canchaId: canchaId === 'todas' ? null : canchaId,
          fechaISO: new Date(`${fecha}T00:00:00`).toISOString(),
          tipo,
          horaInicio: diaCompleto ? null : horaAMinutos(horaInicio),
          horaFin: diaCompleto ? null : horaAMinutos(horaFin),
          nota: nota.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo crear la excepción.');
        return;
      }
      setFecha('');
      setNota('');
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16, display: 'grid', gap: 12 }}>
      <p style={{ fontWeight: 700, fontSize: 14 }}>Cerrar o bloquear un horario</p>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Cancha
        <select
          value={canchaId}
          onChange={(e) => setCanchaId(e.target.value)}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        >
          <option value="todas">Todas las canchas</option>
          {canchas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} · {DEPORTE_LABEL[c.deporte as Deporte]}
            </option>
          ))}
        </select>
      </label>

      <div className="pl-form-grid-2" style={{ gap: 10 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Motivo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          >
            {Object.entries(TIPO_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={diaCompleto} onChange={(e) => setDiaCompleto(e.target.checked)} />
        Bloquear el día completo
      </label>

      {!diaCompleto ? (
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
      ) : null}

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Nota (opcional)
        <input
          type="text"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: torneo interno, mantenimiento de piso"
          maxLength={200}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        />
      </label>

      <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: -6 }}>
        Bloquea reservas nuevas en esa fecha/franja — no cancela ninguna reserva que ya exista ahí; si hace falta,
        cancélala tú a mano.
      </p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <button className="pl-btn" type="submit" disabled={enviando || !fecha} style={{ justifySelf: 'start' }}>
        {enviando ? 'Guardando…' : 'Bloquear'}
      </button>
    </form>
  );
}
