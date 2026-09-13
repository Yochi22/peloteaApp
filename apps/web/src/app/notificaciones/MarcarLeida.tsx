'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function MarcarLeida({ id }: { id: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function marcar() {
    setEnviando(true);
    try {
      await fetch(`/api/notificaciones/${id}/leer`, {
        method: 'POST',
        headers: { 'x-csrf-token': leerCookie('pl_csrf') ?? '' },
      });
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={marcar}
      disabled={enviando}
      style={{ flex: 'none', alignSelf: 'flex-start', fontSize: 11, background: 'none', border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '4px 8px', cursor: 'pointer', color: 'var(--pl-ink-soft)' }}
    >
      Marcar leída
    </button>
  );
}
