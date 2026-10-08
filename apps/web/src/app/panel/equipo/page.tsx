import { redirect } from 'next/navigation';
import { prisma } from '@pelotea/db';
import { requireSesionPanel } from '@/lib/panel-guard';
import { getSesionServer } from '@/lib/session-server';
import { getSedeActiva } from '@/lib/sede';
import { NuevoStaffForm } from './NuevoStaffForm';
import { StaffFila } from './StaffFila';

export const dynamic = 'force-dynamic';

export default async function EquipoPanelPage() {
  await requireSesionPanel('/panel/equipo');
  // Más restrictivo que el resto de /panel a propósito: crear o desactivar
  // cuentas de staff es más sensible que aprobar un pago — mismo criterio
  // que /panel/whatsapp y /panel/configuracion (solo admins, no SEDE_STAFF).
  const sesion = await getSesionServer();
  if (!sesion || !['SEDE_ADMIN', 'PLATAFORMA_ADMIN'].includes(sesion.rol)) {
    redirect('/panel');
  }

  const sede = await getSedeActiva();
  const equipo = await prisma.usuario.findMany({
    where: { sedeId: sede.id, rol: { in: ['SEDE_STAFF', 'SEDE_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main className="pl-container" style={{ paddingBlock: 28, maxWidth: 640 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)', marginTop: 14 }}>
        Tu club
      </p>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>Equipo</h1>
      <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13, marginTop: 6 }}>
        Crea una cuenta por cada persona que aprueba pagos o administra el club — nadie debería compartir login con
        otra persona, así queda claro quién aprobó o rechazó cada cosa.
      </p>

      <section style={{ marginTop: 24 }}>
        <NuevoStaffForm />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Cuentas del equipo</h2>
        {equipo.length === 0 ? (
          <p style={{ color: 'var(--pl-ink-soft)', fontSize: 13 }}>Todavía no has agregado a nadie más.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {equipo.map((u) => (
              <StaffFila
                key={u.id}
                usuario={{ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activa: u.activa }}
                esUnoMismo={u.id === sesion.usuarioId}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
