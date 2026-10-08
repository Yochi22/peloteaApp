'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const ROL_LABEL: Record<string, string> = {
  SEDE_STAFF: 'Staff',
  SEDE_ADMIN: 'Admin',
};

const MENSAJES: Record<string, string> = {
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para esto.',
  sin_permiso: 'No tienes permiso para esto.',
  no_puedes_modificarte: 'No puedes cambiar tu propio rol ni desactivarte.',
};

export interface StaffVisible {
  id: string;
  nombre: string;
  email: string | null;
  rol: string;
  activa: boolean;
}

export function StaffFila({ usuario, esUnoMismo }: { usuario: StaffVisible; esUnoMismo: boolean }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function actualizar(data: { rol?: string; activa?: boolean }) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/usuarios/${usuario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(MENSAJES[body.error] ?? 'No se pudo actualizar.');
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
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 14, opacity: usuario.activa ? 1 : 0.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>
            {usuario.nombre} {esUnoMismo ? <span style={{ fontSize: 11, color: 'var(--pl-ink-soft)', fontWeight: 400 }}>(tú)</span> : null}
          </p>
          <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 2, overflowWrap: 'anywhere' }}>
            {usuario.email} · {ROL_LABEL[usuario.rol] ?? usuario.rol}
            {!usuario.activa ? ' · desactivada' : ''}
          </p>
        </div>
        {!esUnoMismo ? (
          <div style={{ display: 'flex', gap: 8, flex: 'none', flexWrap: 'wrap' }}>
            <select
              value={usuario.rol}
              disabled={enviando}
              onChange={(e) => actualizar({ rol: e.target.value })}
              style={{ border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '6px 8px', fontSize: 12 }}
            >
              <option value="SEDE_STAFF">Staff</option>
              <option value="SEDE_ADMIN">Admin</option>
            </select>
            <button
              type="button"
              disabled={enviando}
              onClick={() => actualizar({ activa: !usuario.activa })}
              className="pl-btn pl-btn--ghost"
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              {usuario.activa ? 'Desactivar' : 'Reactivar'}
            </button>
          </div>
        ) : null}
      </div>
      {error ? (
        <div style={{ marginTop: 8 }}>
          <Alert tone="danger" live>
            {error}
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
