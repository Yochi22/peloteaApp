'use client';

import { useState } from 'react';

export interface DatosPagoMovil {
  banco: string | null;
  cedulaRif: string | null;
  telefono: string | null;
  monto: string;
}

function textoCompleto(d: DatosPagoMovil): string {
  return [
    d.banco ? `Banco: ${d.banco}` : null,
    d.cedulaRif ? `Cédula/RIF: ${d.cedulaRif}` : null,
    d.telefono ? `Teléfono: ${d.telefono}` : null,
    `Monto: Bs ${d.monto}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * En mobile, escribir el pago móvil a mano desde la pantalla es incómodo —
 * copiar y pegar cada dato (o todos de una vez) es mucho más rápido que
 * tener que leerlos y tipearlos en la app del banco.
 */
export function CopiarDatosPago({ datos }: { datos: DatosPagoMovil }) {
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiar(etiqueta: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(etiqueta);
      setTimeout(() => setCopiado((actual) => (actual === etiqueta ? null : actual)), 2000);
    } catch {
      // Sin permiso de portapapeles — el texto sigue visible arriba para copiar a mano.
    }
  }

  const botones: Array<{ etiqueta: string; texto: string | null }> = [
    { etiqueta: 'Copiar todo', texto: textoCompleto(datos) },
    { etiqueta: 'Cédula', texto: datos.cedulaRif },
    { etiqueta: 'Teléfono', texto: datos.telefono },
    { etiqueta: 'Monto', texto: datos.monto },
  ];

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
      {botones
        .filter((b) => b.texto)
        .map((b) => (
          <button
            key={b.etiqueta}
            type="button"
            onClick={() => copiar(b.etiqueta, b.texto!)}
            style={{
              border: '1.5px solid var(--pl-line)',
              background: copiado === b.etiqueta ? 'var(--pl-ok)' : 'var(--pl-bg-raised)',
              color: copiado === b.etiqueta ? '#fff' : 'var(--pl-ink)',
              borderRadius: 7,
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {copiado === b.etiqueta ? 'Copiado ✓' : b.etiqueta}
          </button>
        ))}
    </div>
  );
}
