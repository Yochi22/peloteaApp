import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Favicon de pestaña — no existía ninguno en toda la app. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#d6f000' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M3.5 8.5c5.5 2.4 11.5 2.4 17 0M3.5 15.5c5.5-2.4 11.5-2.4 17 0" stroke="#1d1913" strokeWidth="1.8" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
