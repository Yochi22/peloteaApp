'use client';

import { useRouter } from 'next/navigation';

/** Input de fecha nativo pero que navega solo al cambiar — sin botón "Ver" aparte. */
export function FechaPicker({ fecha, deporte, cancha }: { fecha: string; deporte?: string; cancha?: string }) {
  const router = useRouter();

  function onChange(nuevaFecha: string) {
    if (!nuevaFecha) return;
    const params = new URLSearchParams({ fecha: nuevaFecha });
    if (deporte) params.set('deporte', deporte);
    if (cancha) params.set('cancha', cancha);
    router.push(`/panel/agenda?${params.toString()}`);
  }

  return (
    <input
      type="date"
      className="pl-date-input"
      defaultValue={fecha}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Elegir fecha"
    />
  );
}
