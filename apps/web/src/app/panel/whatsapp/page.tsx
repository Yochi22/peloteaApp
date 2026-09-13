import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Alert } from '@pelotea/ui';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSesionServer } from '@/lib/session-server';
import { obtenerEstadoWhatsapp, obtenerQrWhatsapp } from '@/lib/worker';
import { AutoRefresh } from '../AutoRefresh';
import { ReiniciarWhatsapp } from './ReiniciarWhatsapp';

export const dynamic = 'force-dynamic';

export default async function WhatsappPanelPage() {
  await requireSesionPanel('/panel/whatsapp');
  // Más restrictivo que el resto de /panel a propósito: vincular/desvincular
  // el WhatsApp del club es más sensible que aprobar un pago — solo admins,
  // no SEDE_STAFF.
  const sesion = await getSesionServer();
  if (!sesion || !['SEDE_ADMIN', 'PLATAFORMA_ADMIN'].includes(sesion.rol)) {
    redirect('/panel');
  }

  const estado = await obtenerEstadoWhatsapp();
  const qr = estado && !estado.conectado && estado.qrDisponible ? await obtenerQrWhatsapp() : null;

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 460 }}>
      {/* Refresca cada 5s mientras no esté conectado — el QR de WhatsApp
          expira rápido, y sin esto habría que darle F5 a mano varias veces. */}
      {!estado?.conectado ? <AutoRefresh intervaloSegundos={5} /> : null}
      <Link href="/panel" style={{ fontSize: 13 }}>
        ← Panel
      </Link>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Notificaciones
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>WhatsApp del club</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Solo transaccional — confirmaciones, rechazos y avisos de cancelación. Nunca ofertas ni marketing (riesgo de
        que Meta banee el número).
      </p>

      {!estado ? (
        <div style={{ marginTop: 20 }}>
          <Alert tone="danger" title="No se pudo conectar con el worker" live>
            Revisa que `pelotea-worker` esté corriendo y que `WORKER_BASE_URL`/`WHATSAPP_QR_TOKEN` estén bien
            configurados en `pelotea-web`.
          </Alert>
        </div>
      ) : estado.conectado ? (
        <div style={{ marginTop: 20 }}>
          <Alert tone="ok" title="Conectado" live>
            El WhatsApp del club está vinculado y enviando notificaciones.
          </Alert>
          <div style={{ marginTop: 16 }}>
            <ReiniciarWhatsapp conectado />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          {qr ? (
            <div style={{ textAlign: 'center' }}>
              {/* <img> a propósito: es un data URI generado en el servidor, nunca una URL con token */}
              <img src={qr} alt="Código QR para vincular WhatsApp" width={280} height={280} style={{ margin: '0 auto', borderRadius: 12, border: '1.5px solid var(--pl-line)' }} />
              <p style={{ fontSize: 13, color: 'var(--pl-ink-soft)', marginTop: 12 }}>
                Escanéalo desde el WhatsApp del club: Dispositivos vinculados → Vincular un dispositivo. Esta página
                se actualiza sola cada 5 segundos.
              </p>
            </div>
          ) : (
            <Alert tone="warn" live>
              Generando el código… espera unos segundos, esta página se actualiza sola.
            </Alert>
          )}
          <div style={{ marginTop: 16 }}>
            <ReiniciarWhatsapp conectado={false} />
          </div>
        </div>
      )}
    </main>
  );
}
