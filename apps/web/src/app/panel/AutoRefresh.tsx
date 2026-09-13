'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Refresca los datos del panel solo, sin que el staff tenga que darle F5
 * para ver una reserva/comprobante nuevo. `router.refresh()` vuelve a
 * correr los Server Components de la página (nueva consulta a la base) sin
 * perder el estado del cliente ni la posición de scroll — los hijos que
 * reciben listas por prop (`ColaAprobacion`, `PorCobrar`) ya se sincronizan
 * con el prop nuevo vía `useEffect`. Se pausa cuando la pestaña no está
 * visible, para no gastar cuota de la base en el free tier por nada.
 */
export function AutoRefresh({ intervaloSegundos = 20 }: { intervaloSegundos?: number }) {
  const router = useRouter();
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    function onVisibility() {
      setPausado(document.visibilityState !== 'visible');
    }
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (pausado) return;
    const id = setInterval(() => routerRef.current.refresh(), intervaloSegundos * 1000);
    return () => clearInterval(id);
  }, [pausado, intervaloSegundos]);

  return null;
}
