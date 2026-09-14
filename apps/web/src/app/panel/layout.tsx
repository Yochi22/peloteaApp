import Link from 'next/link';
import type * as React from 'react';
import { PanelNav } from './PanelNav';
import { CerrarSesion } from './CerrarSesion';

/**
 * Shell del panel: sidebar fijo a la izquierda en desktop, franja de pills
 * horizontal arriba en mobile (mismo componente, `.pl-panel-nav` cambia de
 * columna a fila por CSS — ver globals.css) — reemplaza la fila de botones
 * de colores que había repetida en cada página. No hace ninguna
 * verificación de sesión acá: cada página bajo /panel ya llama
 * `requireSesionPanel()` — duplicar el chequeo acá solo complicaría el
 * `next` de redirección (cada página necesita el suyo).
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pl-panel-shell">
      <aside className="pl-panel-sidebar">
        <Link href="/panel" className="pl-panel-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="var(--pl-volt)" />
            <path d="M3.5 8.5c5.5 2.4 11.5 2.4 17 0M3.5 15.5c5.5-2.4 11.5-2.4 17 0" stroke="var(--pl-ink)" strokeWidth="1.7" />
          </svg>
          <strong style={{ fontFamily: 'var(--pl-font-display)', fontSize: 17 }}>Pelotea</strong>
        </Link>
        <PanelNav />
        <div className="pl-panel-sidebar-footer">
          <CerrarSesion />
        </div>
      </aside>
      {/* `div`, no `main`: cada página bajo /panel ya es su propio <main> —
          dos <main> anidados no es HTML válido. */}
      <div className="pl-panel-main">{children}</div>
    </div>
  );
}
