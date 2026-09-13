import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@pelotea/db';
import { renderTextoNotificacion } from '@pelotea/shared';
import { getSesionServer } from '@/lib/session-server';
import { MarcarLeida } from './MarcarLeida';

export const dynamic = 'force-dynamic';

const POR_PAGINA = 30;

export default async function NotificacionesPage() {
  const sesion = await getSesionServer();
  if (!sesion) redirect('/entrar?next=/notificaciones');

  const notificaciones = await prisma.notificacion.findMany({
    where: { usuarioId: sesion.usuarioId, canal: 'IN_APP' },
    orderBy: { createdAt: 'desc' },
    take: POR_PAGINA,
  });

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 560 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
        Tu cuenta
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Notificaciones</h1>

      {notificaciones.length === 0 ? (
        <p style={{ color: 'var(--pl-ink-soft)', fontSize: 14, marginTop: 24 }}>
          Todavía no tienes notificaciones. Acá te avisamos ofertas de última hora, confirmaciones y cambios en tus
          reservas.
        </p>
      ) : (
        <div style={{ marginTop: 20 }}>
          {notificaciones.map((n) => {
            const texto = renderTextoNotificacion(n.plantilla, n.payload as Record<string, unknown>);
            const payload = n.payload as { canchaId?: string; reservaId?: string };
            const href = payload.canchaId ? `/canchas/${payload.canchaId}` : payload.reservaId ? `/reservas/${payload.reservaId}/comprobante` : null;
            return (
              <div
                key={n.id}
                style={{
                  padding: '14px 0',
                  borderBottom: '1.5px solid var(--pl-line)',
                  opacity: n.leidaEn ? 0.6 : 1,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{texto.titulo}</p>
                  <p style={{ fontSize: 13, color: 'var(--pl-ink-soft)', marginTop: 2 }}>{texto.cuerpo}</p>
                  <p style={{ fontSize: 11, color: 'var(--pl-ink-soft)', marginTop: 4 }}>
                    {n.createdAt.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                    {href ? (
                      <>
                        {' · '}
                        <Link href={href}>Ver</Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {!n.leidaEn ? <MarcarLeida id={n.id} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
