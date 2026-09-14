import type * as React from 'react';
import { PanelNav } from './PanelNav';

/**
 * Shell del panel: sidebar fijo a la izquierda en desktop; en mobile, una
 * barra superior compacta (logo + botón de menú) que despliega el mismo
 * menú hacia abajo — nada de scroll horizontal, que no se entendía (había
 * que descubrir que se podía deslizar, y "Cerrar sesión" competía por
 * espacio en esa franja). Todo el toggle vive en PanelNav.tsx (client). No
 * hace ninguna verificación de sesión acá: cada página bajo /panel ya llama
 * `requireSesionPanel()` — duplicar el chequeo acá solo complicaría el
 * `next` de redirección (cada página necesita el suyo).
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pl-panel-shell">
      <aside className="pl-panel-sidebar">
        <PanelNav />
      </aside>
      {/* `div`, no `main`: cada página bajo /panel ya es su propio <main> —
          dos <main> anidados no es HTML válido. */}
      <div className="pl-panel-main">{children}</div>
    </div>
  );
}
