import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/** Ícono de la PWA — mismo trazo de "pelota" que el logo del sidebar del panel. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#d6f000' }}>
        <svg width="370" height="370" viewBox="0 0 24 24" fill="none">
          <path d="M3.5 8.5c5.5 2.4 11.5 2.4 17 0M3.5 15.5c5.5-2.4 11.5-2.4 17 0" stroke="#1d1913" strokeWidth="1.6" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
