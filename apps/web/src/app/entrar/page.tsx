'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const MENSAJES: Record<string, string> = {
  credenciales_invalidas: 'Email o contraseña incorrectos.',
  cuenta_bloqueada: 'Demasiados intentos. Prueba de nuevo en unos minutos.',
  rate_limited: 'Demasiados intentos. Espera un momento.',
  desafio_invalido_o_vencido: 'Se venció el tiempo para el código. Entra de nuevo.',
  codigo_invalido: 'Código incorrecto.',
};

export default function EntrarPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [desafioId, setDesafioId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo iniciar sesión.');
        return;
      }
      if (body.requiere2FA) {
        setDesafioId(body.desafioId);
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

  async function onSubmit2FA(e: React.FormEvent) {
    e.preventDefault();
    if (!desafioId) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({ desafioId, codigo: codigo.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo verificar el código.');
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

  if (desafioId) {
    return (
      <main className="pl-container" style={{ maxWidth: 400, paddingBlock: 48 }}>
        <h1 style={{ fontSize: 28 }}>Verificación en dos pasos</h1>
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 6 }}>
          Escribe el código de 6 dígitos de tu app de autenticación (o uno de tus códigos de recuperación).
        </p>
        <form onSubmit={onSubmit2FA} style={{ display: 'grid', gap: 12, marginTop: 22 }}>
          <input
            autoFocus
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="123456"
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 12, font: 'inherit', fontSize: 18, textAlign: 'center', letterSpacing: '0.2em' }}
          />
          {error ? (
            <Alert tone="danger" live>
              {error}
            </Alert>
          ) : null}
          <button className="pl-btn" type="submit" disabled={enviando}>
            {enviando ? 'Verificando…' : 'Verificar'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="pl-container" style={{ maxWidth: 400, paddingBlock: 48 }}>
      <h1 style={{ fontSize: 28 }}>Entrar</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 6 }}>
        Ofertas de última hora, dividir pagos y partidos abiertos te esperan.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 22 }}>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
          Contraseña
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' }}
          />
        </label>

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}

        <button className="pl-btn" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p style={{ marginTop: 18, fontSize: 13, color: 'var(--pl-ink-soft)' }}>
        ¿No tienes cuenta? <Link href={`/registrarse?next=${encodeURIComponent(next)}`}>Regístrate gratis</Link>
      </p>
    </main>
  );
}
