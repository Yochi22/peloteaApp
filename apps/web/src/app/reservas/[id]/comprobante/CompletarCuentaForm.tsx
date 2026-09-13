'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  email_en_uso: 'Ese email ya tiene una cuenta. Inicia sesión en vez de crear una nueva.',
  falta_email: 'Escribe un email para tu cuenta.',
  no_autorizado: 'Este enlace ya no es válido.',
};

/**
 * El invitado ya existe como Usuario (se creó al reservar) — esto solo le
 * agrega contraseña (y email, si no lo dio) para que su reserva quede
 * guardada en una cuenta real, con acceso a ofertas, split y partidos ya.
 */
export function CompletarCuentaForm({
  reservaId,
  token,
  emailConocido,
  nombre,
}: {
  reservaId: string;
  token: string;
  emailConocido: string | null;
  nombre: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/completar-cuenta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ reservaId, token, password, ...(emailConocido ? {} : { email }) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo crear tu cuenta.');
        return;
      }
      setListo(true);
      router.refresh();
    } catch {
      setError('Problema de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <Alert tone="ok" title={`¡Listo, ${nombre}!`} live>
        Tu cuenta quedó creada y esta reserva ya está guardada en ella. La próxima vez puedes dividir el
        pago o unirte a partidos abiertos.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, border: '1.5px solid var(--pl-line)', borderRadius: 12, padding: 18 }}>
      <p style={{ fontWeight: 700 }}>Solo falta una contraseña</p>
      {!emailConocido ? (
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Tu email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
          />
        </label>
      ) : null}
      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
        Elige una contraseña (mínimo 10 caracteres)
        <input
          type="password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
        />
      </label>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <button className="pl-btn" type="submit" disabled={enviando}>
        {enviando ? 'Creando cuenta…' : 'Crear mi cuenta gratis'}
      </button>
    </form>
  );
}
