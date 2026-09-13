'use client';

import { useState } from 'react';
import { Alert } from '@pelotea/ui';

/**
 * Un invitado (sin cuenta) accede a SU reserva solo por este link con
 * token — antes no había ningún aviso de "guarda esto" ni forma de
 * compartirlo; si cerraba la pestaña sin copiar la URL, perdía el único
 * acceso a cancelar o ver su reserva más tarde.
 */
export function CompartirReserva({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso de portapapeles (poco común) — el input de abajo sigue
      // sirviendo para copiar a mano.
    }
  }

  const textoWhatsapp = encodeURIComponent(`Aquí está mi reserva: ${link}`);

  return (
    <div style={{ marginTop: 24, border: '1.5px solid var(--pl-line)', borderRadius: 12, padding: 16 }}>
      <p style={{ fontWeight: 700, fontSize: 14 }}>Guarda este link</p>
      <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)', marginTop: 4 }}>
        Como reservaste sin cuenta, esta es la única forma de volver a ver o cancelar tu reserva. Compártelo con
        quien vaya a jugar contigo si quieres.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          style={{ flex: '1 1 200px', minWidth: 0, border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 8, fontSize: 12, background: 'var(--pl-bg-sunken)' }}
        />
        <button
          type="button"
          onClick={copiar}
          className="pl-btn pl-btn--ghost"
          style={{ padding: '8px 14px', fontSize: 13 }}
        >
          {copiado ? 'Copiado ✓' : 'Copiar'}
        </button>
        <a
          href={`https://wa.me/?text=${textoWhatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="pl-btn"
          style={{ textDecoration: 'none', padding: '8px 14px', fontSize: 13, background: '#25D366' }}
        >
          Compartir por WhatsApp
        </a>
      </div>
      {copiado ? (
        <div style={{ marginTop: 8 }}>
          <Alert tone="ok" live>
            Link copiado.
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
