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
  ya_configurado: 'Este club ya tiene una cuenta configurada — entra por /entrar en vez de esto.',
  no_se_pudo_registrar: 'No se pudo completar el registro con esos datos.',
  rate_limited: 'Demasiados intentos. Espera un momento.',
};

export function ConfigurarClubForm() {
  const router = useRouter();
  const [sedeNombre, setSedeNombre] = useState('');
  const [pagoMovilBanco, setPagoMovilBanco] = useState('');
  const [pagoMovilCedulaRif, setPagoMovilCedulaRif] = useState('');
  const [pagoMovilTelefono, setPagoMovilTelefono] = useState('');
  const [adminNombre, setAdminNombre] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
        body: JSON.stringify({
          sedeNombre,
          pagoMovilBanco: pagoMovilBanco || undefined,
          pagoMovilCedulaRif: pagoMovilCedulaRif || undefined,
          pagoMovilTelefono: pagoMovilTelefono || undefined,
          adminNombre,
          adminEmail,
          adminPassword,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(MENSAJES[body.error] ?? body.message ?? 'No se pudo crear el club.');
        return;
      }
      // Va a /panel — si el rol exige 2FA (siempre, para SEDE_ADMIN),
      // requireSesionPanel() lo manda directo a activarlo antes de entrar.
      router.push('/panel');
      router.refresh();
    } catch {
      setError('Problema de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  const campo: React.CSSProperties = { border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 10, font: 'inherit' };
  const label: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 };

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, marginTop: 22 }}>
      <label style={label}>
        Nombre del club
        <input required maxLength={120} value={sedeNombre} onChange={(e) => setSedeNombre(e.target.value)} placeholder="Club Deportivo La Trinidad" style={campo} />
      </label>

      <div style={{ borderTop: '1.5px solid var(--pl-line)', paddingTop: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
          Datos de pago móvil (opcional — se puede completar después)
        </p>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <label style={label}>
            Banco
            <input maxLength={80} value={pagoMovilBanco} onChange={(e) => setPagoMovilBanco(e.target.value)} placeholder="0102 - Banco de Venezuela" style={campo} />
          </label>
          <label style={label}>
            Cédula / RIF
            <input maxLength={20} value={pagoMovilCedulaRif} onChange={(e) => setPagoMovilCedulaRif(e.target.value)} placeholder="J-12345678-9" style={campo} />
          </label>
          <label style={label}>
            Teléfono
            <input value={pagoMovilTelefono} onChange={(e) => setPagoMovilTelefono(e.target.value)} placeholder="0414-1234567" style={campo} />
          </label>
        </div>
      </div>

      <div style={{ borderTop: '1.5px solid var(--pl-line)', paddingTop: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
          Tu cuenta de administrador
        </p>
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <label style={label}>
            Tu nombre
            <input required maxLength={80} value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} style={campo} />
          </label>
          <label style={label}>
            Email
            <input type="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} style={campo} />
          </label>
          <label style={label}>
            Contraseña (mínimo 10 caracteres)
            <input type="password" required minLength={10} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} style={campo} />
          </label>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <button className="pl-btn" type="submit" disabled={enviando}>
        {enviando ? 'Creando…' : 'Crear mi club'}
      </button>
      <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)' }}>
        Después vas a tener que activar la verificación en dos pasos para entrar al panel — es obligatoria para
        administradores.
      </p>
    </form>
  );
}
