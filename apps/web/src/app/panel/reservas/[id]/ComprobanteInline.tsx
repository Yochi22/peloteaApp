'use client';

import { useState } from 'react';

/**
 * Muestra el comprobante EN LA MISMA PÁGINA, sin forzar descarga — el
 * objeto en el bucket tiene `Content-Disposition: attachment` (a propósito,
 * para cuando alguien abre la URL firmada directo), pero un <img> normal la
 * carga igual como imagen embebida en casi todos los navegadores. Antes el
 * único botón hacía `window.open(url)`, que sí terminaba forzando la
 * descarga en vez de mostrarla.
 */
export function ComprobanteInline({ pagoId, esPdf }: { pagoId: string; esPdf: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verComprobante() {
    if (url) {
      setUrl(null); // toggle: si ya está abierto, lo cierra
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/pagos/${pagoId}/comprobante-url`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'No se pudo cargar el comprobante.');
        return;
      }
      setUrl(body.url);
    } catch {
      setError('Problema de conexión.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={verComprobante}
        disabled={cargando}
        style={{ border: '1.5px solid var(--pl-line)', background: 'transparent', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >
        {cargando ? 'Cargando…' : url ? 'Ocultar comprobante' : 'Ver comprobante'}
      </button>
      {error ? <p style={{ fontSize: 12, color: 'var(--pl-danger)', marginTop: 6 }}>{error}</p> : null}
      {url ? (
        <div style={{ marginTop: 10, border: '1.5px solid var(--pl-line)', borderRadius: 10, padding: 8, maxWidth: 380 }}>
          {esPdf ? (
            // Un PDF sí puede forzar descarga en algunos navegadores por el
            // Content-Disposition del objeto — se avisa en vez de sorprender.
            <p style={{ fontSize: 12 }}>
              Es un PDF — <a href={url} target="_blank" rel="noopener noreferrer">ábrelo en una pestaña nueva</a> (tu
              navegador puede descargarlo en vez de mostrarlo, según cómo lo tengas configurado).
            </p>
          ) : (
            // <img> a propósito: es una URL firmada temporal, no un asset estático de Next/Image
            <img src={url} alt="Comprobante de pago" style={{ display: 'block', width: '100%', borderRadius: 6 }} />
          )}
        </div>
      ) : null}
    </div>
  );
}
