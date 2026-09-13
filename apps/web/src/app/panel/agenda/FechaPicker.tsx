'use client';

import { useRouter } from 'next/navigation';

/** Input de fecha nativo pero que navega solo al cambiar — sin botón "Ver" aparte. */
export function FechaPicker({ fecha, deporte }: { fecha: string; deporte?: string }) {
  const router = useRouter();

  function onChange(nuevaFecha: string) {
    if (!nuevaFecha) return;
    const params = new URLSearchParams({ fecha: nuevaFecha });
    if (deporte) params.set('deporte', deporte);
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
