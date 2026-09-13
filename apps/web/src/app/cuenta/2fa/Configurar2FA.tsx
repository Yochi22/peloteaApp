'use client';

import { useState } from 'react';
import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function csrfHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' };
}

const MENSAJES: Record<string, string> = {
  codigo_invalido: 'Código incorrecto.',
  credenciales_invalidas: 'Contraseña o código incorrectos.',
  rate_limited: 'Demasiados intentos. Espera un momento.',
};

export function Configurar2FA({ activadaInicial, destino }: { activadaInicial: boolean; destino?: string | null }) {
  const router = useRouter();
  const [activada, setActivada] = useState(activadaInicial);
  const [paso, setPaso] = useState<'idle' | 'qr' | 'codigos'>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secretoManual, setSecretoManual] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [codigosRecuperacion, setCodigosRecuperacion] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Desactivar
  const [passwordDesactivar, setPasswordDesactivar] = useState('');
  const [codigoDesactivar, setCodigoDesactivar] = useState('');
  const [mostrarDesactivar, setMostrarDesactivar] = useState(false);

  async function iniciar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/iniciar', { method: 'POST', headers: csrfHeaders() });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo empezar. Intenta de nuevo.');
        return;
      }
      setQrDataUrl(body.qrDataUrl);
      setSecretoManual(body.secretBase32);
      setPaso('qr');
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/confirmar', { method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ codigo: codigo.trim() }) });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo confirmar.');
        return;
      }
      setCodigosRecuperacion(body.codigosRecuperacion);
      setPaso('codigos');
      setActivada(true);
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  async function desactivar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/desactivar', {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ password: passwordDesactivar, codigo: codigoDesactivar.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? 'No se pudo desactivar.');
        return;
      }
      setActivada(false);
      setMostrarDesactivar(false);
      setPasswordDesactivar('');
      setCodigoDesactivar('');
      router.refresh();
    } catch {
      setError('Problema de conexión.');
    } finally {
      setEnviando(false);
    }
  }

  if (paso === 'codigos') {
    return (
      <div style={{ marginTop: 22 }}>
        <Alert tone="ok" title="2FA activado" live>
          Guarda estos códigos de recuperación en un lugar seguro — cada uno sirve UNA vez si pierdes el teléfono. No
          se vuelven a mostrar.
        </Alert>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, fontFamily: 'monospace' }}>
          {codigosRecuperacion.map((c) => (
            <div key={c} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', fontSize: 13 }}>
              {c}
            </div>
          ))}
        </div>
        <button
          className="pl-btn"
          style={{ marginTop: 18 }}
          onClick={() => (destino ? router.push(destino) : setPaso('idle'))}
        >
          {destino ? 'Listo, ir al panel' : 'Listo'}
        </button>
      </div>
    );
  }

  if (paso === 'qr') {
    return (
      <form onSubmit={confirmar} style={{ marginTop: 22, display: 'grid', gap: 14 }}>
        <p style={{ fontSize: 13 }}>
          Escanea este código con Google Authenticator, Authy, o la app que uses — o escribe el código manualmente.
        </p>
        {qrDataUrl ? <img src={qrDataUrl} alt="Código QR de verificación en dos pasos" width={200} height={200} style={{ alignSelf: 'center' }} /> : null}
        {secretoManual ? (
          <p style={{ fontFamily: 'monospace', fontSize: 13, textAlign: 'center', wordBreak: 'break-all', color: 'var(--pl-ink-soft)' }}>{secretoManual}</p>
        ) : null}
        <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Código de 6 dígitos
          <input
            autoFocus
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="123456"
            style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit', textAlign: 'center', letterSpacing: '0.2em' }}
          />
        </label>
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        <button className="pl-btn" type="submit" disabled={enviando}>
          {enviando ? 'Verificando…' : 'Confirmar y activar'}
        </button>
      </form>
    );
  }

  return (
    <div style={{ marginTop: 22 }}>
      {activada ? (
        <>
          <Alert tone="ok">2FA está activo en tu cuenta.</Alert>
          {!mostrarDesactivar ? (
            <button
              type="button"
              onClick={() => setMostrarDesactivar(true)}
              style={{ marginTop: 14, background: 'none', border: 0, color: 'var(--pl-danger)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              Desactivar 2FA
            </button>
          ) : (
            <form onSubmit={desactivar} style={{ display: 'grid', gap: 10, marginTop: 14, border: '1.5px solid var(--pl-line)', borderRadius: 12, padding: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>Confirma tu contraseña y el código actual para desactivar.</p>
              <input
                type="password"
                required
                placeholder="Contraseña"
                value={passwordDesactivar}
                onChange={(e) => setPasswordDesactivar(e.target.value)}
                style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
              />
              <input
                required
                placeholder="Código de 6 dígitos"
                value={codigoDesactivar}
                onChange={(e) => setCodigoDesactivar(e.target.value)}
                style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 9, font: 'inherit' }}
              />
              {error ? (
                <Alert tone="danger" live>
                  {error}
                </Alert>
              ) : null}
              <button type="submit" disabled={enviando} style={{ background: 'var(--pl-danger)', color: '#fff', border: 0, borderRadius: 8, padding: '9px 0', fontWeight: 700, cursor: 'pointer' }}>
                {enviando ? '…' : 'Sí, desactivar'}
              </button>
            </form>
          )}
        </>
      ) : (
        <>
          {error ? (
            <div style={{ marginBottom: 12 }}>
              <Alert tone="danger" live>
                {error}
              </Alert>
            </div>
          ) : null}
          <button className="pl-btn" onClick={iniciar} disabled={enviando}>
            {enviando ? 'Generando…' : 'Activar 2FA'}
          </button>
        </>
      )}
    </div>
  );
}
