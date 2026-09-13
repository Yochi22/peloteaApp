'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function CerrarSesion() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function salir() {
    setEnviando(true);
    try {
      await fetch('/api/auth/salir', { method: 'POST', headers: { 'x-csrf-token': leerCookie('pl_csrf') ?? '' } });
      router.push('/entrar');
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={salir}
      disabled={enviando}
      className="pl-btn pl-btn--ghost"
      style={{ cursor: 'pointer' }}
    >
      {enviando ? '…' : 'Cerrar sesión'}
    </button>
  );
}
