import Link from 'next/link';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSedeActiva } from '@/lib/sede';
import { CambiarMoneda } from './CambiarMoneda';

export const dynamic = 'force-dynamic';

export default async function ConfiguracionPage() {
  await requireSesionPanel('/panel/configuracion');
  const sede = await getSedeActiva();

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 480 }}>
      <Link href="/panel" style={{ fontSize: 13 }}>
        ← Panel
      </Link>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Configuración
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Moneda de las tarifas</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        En qué moneda fija el club el precio de sus canchas. El cobro real a los jugadores siempre es en
        bolívares, al cambio del día (ver <Link href="/panel/tasa-cambio">Tasa de cambio</Link>).
      </p>

      <CambiarMoneda monedaActual={sede.precioMoneda as 'USD' | 'EUR' | 'VES'} />
    </main>
  );
}
