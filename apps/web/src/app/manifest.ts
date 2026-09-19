import type { MetadataRoute } from 'next';

/**
 * Convención de Next.js: esto se sirve solo en `/manifest.webmanifest` y
 * Next agrega el `<link rel="manifest">` en el `<head>` de todas las
 * páginas — no hace falta tocar `layout.tsx` para eso.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pelotea — reserva tu cancha',
    short_name: 'Pelotea',
    description: 'Reserva canchas de tenis, pádel, beach tennis, vóley playa y fútbol. Paga por pago móvil y confirma en minutos.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f0e3',
    theme_color: '#f5f0e3',
    lang: 'es-VE',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
