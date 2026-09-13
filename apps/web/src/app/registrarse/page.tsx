'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert, BeneficiosCuenta } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export default function RegistrarsePage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', password: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? 'No se pudo completar el registro.');
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('Problema de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="pl-container pl-register-layout" style={{ paddingBlock: 48, maxWidth: 780 }}>
      <div>
        <h1 style={{ fontSize: 28 }}>Crea tu cuenta</h1>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 6 }}>Es gratis y toma menos de un minuto.</p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 22 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
            Nombre
            <input required maxLength={80} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
            Email
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
            Teléfono
            <input required placeholder="0414-1234567" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
            Contraseña (mínimo 10 caracteres)
            <input type="password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }} />
          </label>

          {error ? (
            <Alert tone="danger" live>
              {error}
            </Alert>
          ) : null}

          <button className="pl-btn" type="submit" disabled={enviando}>
            {enviando ? 'Creando cuenta…' : 'Crear cuenta gratis'}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 13, color: 'var(--pl-ink-soft)' }}>
          ¿Ya tienes cuenta? <Link href={`/entrar?next=${encodeURIComponent(next)}`}>Entra aquí</Link>
        </p>
      </div>

      <BeneficiosCuenta />
    </main>
  );
}
