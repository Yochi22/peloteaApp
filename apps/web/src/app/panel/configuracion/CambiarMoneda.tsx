'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

type Moneda = 'USD' | 'EUR' | 'VES';

const OPCIONES: { valor: Moneda; etiqueta: string }[] = [
  { valor: 'USD', etiqueta: 'Dólares (USD)' },
  { valor: 'EUR', etiqueta: 'Euros (EUR)' },
  { valor: 'VES', etiqueta: 'Bolívares (VES) — sin conversión' },
];

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para cambiar esto.',
  sin_permiso: 'No tienes permiso para cambiar esto.',
};

export function CambiarMoneda({ monedaActual }: { monedaActual: Moneda }) {
  const router = useRouter();
  const [seleccion, setSeleccion] = useState<Moneda>(monedaActual);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const hayCambio = seleccion !== monedaActual;

  async function confirmar() {
    setEnviando(true);
    setError(null);
    setExito(false);
    try {
      const res = await fetch('/api/admin/sede', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ precioMoneda: seleccion }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo guardar el cambio.');
        return;
      }
      setExito(true);
      setConfirmando(false);
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        {OPCIONES.map((op) => (
          <label
            key={op.valor}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: '1.5px solid var(--pl-line)',
              borderRadius: 10,
              padding: 12,
              cursor: 'pointer',
              background: seleccion === op.valor ? 'var(--pl-bg-raised)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name="moneda"
              checked={seleccion === op.valor}
              onChange={() => {
                setSeleccion(op.valor);
                setConfirmando(false);
                setExito(false);
              }}
            />
            <span style={{ fontSize: 14 }}>{op.etiqueta}</span>
          </label>
        ))}
      </div>

      {hayCambio ? (
        <div style={{ marginTop: 16 }}>
          <Alert tone="warn" title="Esto no convierte los precios ya cargados" live>
            Cambiar la moneda solo afecta cómo se interpretan las tarifas de ahí en adelante — los precios que ya
            tienen las canchas (plantillas de horario y reglas de precio) se quedan con el mismo número. Después
            de cambiar, revisa y vuelve a cargar las tarifas a mano si hace falta.
          </Alert>
          {!confirmando ? (
            <button className="pl-btn" style={{ marginTop: 12 }} onClick={() => setConfirmando(true)}>
              Continuar
            </button>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="pl-btn" disabled={enviando} onClick={confirmar}>
                {enviando ? 'Guardando…' : `Sí, cambiar a ${seleccion}`}
              </button>
              <button
                type="button"
                className="pl-btn pl-btn--ghost"
                disabled={enviando}
                onClick={() => {
                  setConfirmando(false);
                  setSeleccion(monedaActual);
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}
      {exito ? (
        <div style={{ marginTop: 12 }}>
          <Alert tone="ok" live>
            Moneda actualizada.
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
