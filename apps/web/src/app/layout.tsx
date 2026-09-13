import type { Metadata, Viewport } from 'next';
import type * as React from 'react';
import { headers } from 'next/headers';
import '@pelotea/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Pelotea — reserva tu cancha', template: '%s · Pelotea' },
  description:
    'Reserva canchas de tenis, pádel, beach tennis, vóley playa y fútbol. Paga por pago móvil y confirma en minutos.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#f5f0e3',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="es-VE">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          nonce={nonce}
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
