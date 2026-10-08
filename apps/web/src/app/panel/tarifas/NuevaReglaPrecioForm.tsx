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
  sin_permiso: 'No tienes permiso para crear reglas de precio.',
  cancha_no_encontrada: 'Esa cancha ya no existe.',
  validation: 'Revisa los datos — si pones hora, la de fin debe ser después de la de inicio.',
};

export function NuevaReglaPrecioForm({ canchas }: { canchas: Array<{ id: string; nombre: string; deporte: string }> }) {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [canchaId, setCanchaId] = useState<'todas' | string>('todas');
  const [diaSemana, setDiaSemana] = useState<number | 'todos'>('todos');
  const [diaCompleto, setDiaCompleto] = useState(false);
  const [horaDesde, setHoraDesde] = useState('18:00');
  const [horaHasta, setHoraHasta] = useState('22:00');
  const [tipoModificador, setTipoModificador] = useState<'PORCENTAJE' | 'MONTO_FIJO'>('PORCENTAJE');
  const [valor, setValor] = useState(25);
  const [prioridad, setPrioridad] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('Dale un nombre a la regla (ej. "Peak tarde entre semana").');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reglas-precio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({
          canchaId: canchaId === 'todas' ? null : canchaId,
          nombre: nombre.trim(),
          diaSemana: diaSemana === 'todos' ? null : diaSemana,
          horaDesde: diaCompleto ? null : horaAMinutos(horaDesde),
          horaHasta: diaCompleto ? null : horaAMinutos(horaHasta),
          tipoModificador,
          valor,
          prioridad,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo crear la regla.');
        return;
      }
      setNombre('');
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16, display: 'grid', gap: 12 }}>
      <p style={{ fontWeight: 700, fontSize: 14 }}>Crear una regla de precio</p>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Nombre (para reconocerla en la lista)
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Peak tarde entre semana"
          maxLength={80}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        />
      </label>

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

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={diaCompleto} onChange={(e) => setDiaCompleto(e.target.checked)} />
        Todo el día (sin franja horaria)
      </label>

      {!diaCompleto ? (
        <div className="pl-form-grid-2" style={{ gap: 10 }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Desde
            <input
              type="time"
              value={horaDesde}
              onChange={(e) => setHoraDesde(e.target.value)}
              style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Hasta
            <input
              type="time"
              value={horaHasta}
              onChange={(e) => setHoraHasta(e.target.value)}
              style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
            />
          </label>
        </div>
      ) : null}

      <div className="pl-form-grid-2" style={{ gap: 10 }}>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Tipo
          <select
            value={tipoModificador}
            onChange={(e) => setTipoModificador(e.target.value as 'PORCENTAJE' | 'MONTO_FIJO')}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          >
            <option value="PORCENTAJE">Porcentaje (%)</option>
            <option value="MONTO_FIJO">Monto fijo</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Valor {tipoModificador === 'PORCENTAJE' ? '(+recargo, -descuento)' : '(en la moneda de tus tarifas)'}
          <input
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(Number(e.target.value))}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
      </div>

      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Prioridad (si varias reglas se superponen, se aplican todas, de mayor a menor)
        <input
          type="number"
          min={0}
          max={100}
          value={prioridad}
          onChange={(e) => setPrioridad(Number(e.target.value))}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
        />
      </label>

      <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: -6 }}>
        Afecta reservas nuevas de inmediato — nunca cambia el precio de una reserva ya hecha.
      </p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <button className="pl-btn" type="submit" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear regla'}
      </button>
    </form>
  );
}
