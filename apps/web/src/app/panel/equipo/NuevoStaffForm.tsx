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
  '2fa_requerido': 'Tu rol exige verificación en dos pasos activa para esto.',
  sin_permiso: 'No tienes permiso para crear cuentas de equipo.',
  email_en_uso: 'Ya existe una cuenta con ese email.',
  validation: 'Revisa los datos — la contraseña debe tener al menos 10 caracteres.',
};

function generarPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function NuevoStaffForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rol, setRol] = useState<'SEDE_STAFF' | 'SEDE_ADMIN'>('SEDE_STAFF');
  const [password, setPassword] = useState(generarPassword);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ nombre, email, telefono: telefono.trim() || undefined, password, rol }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo crear la cuenta.');
        return;
      }
      setCreado({ email, password });
      setNombre('');
      setEmail('');
      setTelefono('');
      setPassword(generarPassword());
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {creado ? (
        <Alert tone="ok" title="Cuenta creada" live>
          Pásale estos datos por fuera de la app (WhatsApp, en persona): <strong>{creado.email}</strong> / contraseña{' '}
          <strong>{creado.password}</strong>. No se vuelve a mostrar la contraseña después de esto.
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16, display: 'grid', gap: 12 }}>
        <p style={{ fontWeight: 700, fontSize: 14 }}>Agregar a alguien del equipo</p>

        <div className="pl-form-grid-2" style={{ gap: 10 }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Nombre
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
            />
          </label>
        </div>

        <div className="pl-form-grid-2" style={{ gap: 10 }}>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Teléfono (opcional)
            <input
              placeholder="0414-1234567"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value as 'SEDE_STAFF' | 'SEDE_ADMIN')} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}>
              <option value="SEDE_STAFF">Staff (aprueba/rechaza pagos)</option>
              <option value="SEDE_ADMIN">Admin (acceso completo)</option>
            </select>
          </label>
        </div>

        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Contraseña inicial
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
              style={{ flex: 1, border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
            />
            <button
              type="button"
              onClick={() => setPassword(generarPassword())}
              style={{ fontSize: 12, fontWeight: 600, border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: '0 12px', background: 'var(--pl-bg-raised)', cursor: 'pointer' }}
            >
              Generar otra
            </button>
          </div>
        </label>

        <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: -4 }}>
          Se la pasas tú mismo por fuera de la app — no hay email conectado todavía. Si es SEDE_ADMIN, también le
          conviene activar la verificación en dos pasos en cuanto entre.
        </p>

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}

        <button className="pl-btn" type="submit" disabled={enviando} style={{ justifySelf: 'start' }}>
          {enviando ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  );
}
