'use client';

import { useEffect } from 'react';

/** Registra el service worker mínimo de la PWA (ver `public/sw.js`) — no hace nada visible, es "instalar y listo". */
export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // No pasa nada si falla (ej. navegador viejo) — la app funciona igual sin SW.
      });
    }
  }, []);
  return null;
}
