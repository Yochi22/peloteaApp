import { NextResponse, type NextRequest } from 'next/server';
import { confirmarPartidoSchema, transicionar, dividirEnCuotas, PLANTILLAS_NOTIFICACION } from '@pelotea/shared';
import { prisma, Prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion } from '@/lib/session';
import { calcularPrecioReserva, HttpError } from '@/lib/precio-reserva';

export const runtime = 'nodejs';

/**
 * El organizador confirma un partido comunitario ya lleno y dispara la
 * reserva de verdad — el paso que el diseño pide que sea explícito, nunca
 * automático al llenarse el cupo (a diferencia de la versión vieja de esto,
 * `autoReservarPartido()`, que reservaba sola en el momento en que se unía
 * el último jugador).
 *
 * Acá es donde se revalida disponibilidad: el partido nació para una
 * categoría/deporte, no para una cancha puntual (`Cancha.cantidad` — pool
 * de canchas idénticas), así que hay que buscar, AL MOMENTO de confirmar,
 * cuál cancha de esa disciplina todavía tiene cupo en ese horario — el
 * tiempo entre "se llenó" y "el organizador confirma" es exactamente la
 * ventana en la que otra reserva normal pudo haberse adelantado.
 *
 * `dividir` decide cómo se paga: entre todos (split, cada uno su cuota) o
 * el organizador solo (abono o pago completo según la política de pago
 * parcial de la sede — igual que cualquier reserva normal sin split).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: partidoId } = await params;
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const g = await guard(req, {
    preset: 'mutation',
    schema: confirmarPartidoSchema,
    idempotencyScope: 'confirmar-partido',
    subject: `${sesion.usuarioId}:${partidoId}`,
  });
  if (!g.ok) return g.response;
  const { dividir } = g.data;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const partido = await tx.partidoAbierto.findUnique({
        where: { id: partidoId },
        include: { participantes: { orderBy: { createdAt: 'asc' } }, reserva: true },
      });
      if (!partido) throw new HttpError(404, 'partido_no_encontrado');
      if (partido.organizadorId !== sesion.usuarioId) throw new HttpError(403, 'solo_el_organizador_puede_confirmar');
      if (partido.estado !== 'COMPLETO') throw new HttpError(409, 'partido_no_esta_listo');
      if (partido.reserva && !['CANCELADA', 'EXPIRADA'].includes(partido.reserva.estado)) {
        throw new HttpError(409, 'ya_tiene_reserva');
      }
      // Respaldo del barrido del worker (cada 5 min) — no dejar confirmar
      // (y menos aún pagar) una hora que ya pasó solo porque el barrido
      // todavía no corrió.
      if (partido.inicio <= new Date()) throw new HttpError(409, 'partido_ya_paso');

      const sede = await tx.sede.findUniqueOrThrow({ where: { id: partido.sedeId } });
      const duracionMin = Math.round((partido.fin.getTime() - partido.inicio.getTime()) / 60_000);

      // Busca, entre las canchas activas de esa disciplina (respetando la
      // cancha puntual si el organizador ya había elegido una al crear el
      // partido), la primera que de verdad tenga cupo libre en TODAS las
      // horas que dura el partido — mismo criterio de reparto por `unidad`
      // que usa /api/reservas para el pool.
      const candidatas = await tx.cancha.findMany({
        where: {
          sedeId: sede.id,
          deporte: partido.deporte,
          activa: true,
          ...(partido.canchaId ? { id: partido.canchaId } : {}),
          ...(partido.superficie ? { superficie: partido.superficie } : {}),
        },
        orderBy: { orden: 'asc' },
      });

      let elegida: { canchaId: string; duracionTurnoMin: number; cantidad: number; asignacion: Array<{ inicio: Date; unidad: number }> } | null =
        null;
      for (const cancha of candidatas) {
        if (duracionMin % cancha.duracionTurnoMin !== 0 || duracionMin < cancha.duracionTurnoMin || duracionMin > cancha.duracionMaximaMin) {
          continue;
        }
        const unidades = duracionMin / cancha.duracionTurnoMin;
        const inicios = Array.from({ length: unidades }, (_, u) => new Date(partido.inicio.getTime() + u * cancha.duracionTurnoMin * 60_000));

        const asignacion: Array<{ inicio: Date; unidad: number }> = [];
        let cabeCompleta = true;
        for (const inicioUnidad of inicios) {
          const tomados = await tx.slotLock.findMany({
            where: { canchaId: cancha.id, inicio: inicioUnidad, expiraEn: { gt: new Date() } },
            select: { unidad: true },
          });
          const usados = new Set(tomados.map((t) => t.unidad));
          let unidad = 0;
          for (let u = 1; u <= cancha.cantidad; u++) {
            if (!usados.has(u)) {
              unidad = u;
              break;
            }
          }
          if (!unidad) {
            cabeCompleta = false;
            break;
          }
          asignacion.push({ inicio: inicioUnidad, unidad });
        }
        if (cabeCompleta) {
          elegida = { canchaId: cancha.id, duracionTurnoMin: cancha.duracionTurnoMin, cantidad: cancha.cantidad, asignacion };
          break;
        }
      }
      if (!elegida) throw new HttpError(409, 'sin_disponibilidad');

      const canchaElegida = await tx.cancha.findUniqueOrThrow({ where: { id: elegida.canchaId } });
      const precio = await calcularPrecioReserva(tx, sede, canchaElegida, partido.inicio, duracionMin, { esSplit: dividir });

      const nueva = await tx.reserva.create({
        data: {
          sedeId: sede.id,
          canchaId: elegida.canchaId,
          organizadorId: partido.organizadorId,
          inicio: partido.inicio,
          fin: precio.fin,
          estado: transicionar('BORRADOR', 'INICIAR_PAGO'),
          canal: 'PARTIDO_ABIERTO',
          precioTotal: new Prisma.Decimal(precio.total),
          montoServicio: new Prisma.Decimal(precio.montoServicio),
          montoAbono: new Prisma.Decimal(precio.montoAbono),
          montoRestante: new Prisma.Decimal(precio.montoRestante),
          precioTotalRef: new Prisma.Decimal(precio.totalRef),
          monedaRef: precio.monedaRef,
          tasaCambio: new Prisma.Decimal(precio.tasaCambio),
          esDividida: dividir,
          partidoAbiertoId: partido.id,
          // Más margen que una reserva normal (15 min): ya son varias
          // personas coordinando quién paga, no solo una.
          holdExpiraEn: new Date(Date.now() + 30 * 60_000),
        },
      });

      // Si alguien más tomó esa unidad entre que se leyó arriba y este
      // insert, esto tira P2002 y la transacción entera se revierte — el
      // organizador simplemente reintenta (buscará otra cancha o avisará
      // que no hay cupo).
      await tx.slotLock.createMany({
        data: elegida.asignacion.map(({ inicio, unidad }) => ({
          sedeId: sede.id,
          canchaId: elegida!.canchaId,
          inicio,
          fin: new Date(inicio.getTime() + elegida!.duracionTurnoMin * 60_000),
          unidad,
          reservaId: nueva.id,
          expiraEn: nueva.holdExpiraEn!,
        })),
      });

      if (dividir) {
        const montos = dividirEnCuotas(precio.total, partido.participantes.length);
        await Promise.all(
          partido.participantes.map((p, i) =>
            tx.cuota.create({
              data: {
                reservaId: nueva.id,
                monto: new Prisma.Decimal(montos[i]!),
                esOrganizador: p.usuarioId === partido.organizadorId,
                participanteId: p.usuarioId,
              },
            }),
          ),
        );
      }

      // Avisa a los demás participantes que ya hay que pagar (split) o que
      // el organizador ya está gestionando la reserva (si paga él solo).
      const otros = partido.participantes.filter((p) => p.usuarioId !== partido.organizadorId);
      if (otros.length > 0) {
        await tx.notificacion.createMany({
          data: otros.map((p) => ({
            usuarioId: p.usuarioId,
            canal: 'IN_APP' as const,
            plantilla: dividir ? PLANTILLAS_NOTIFICACION.SPLIT_INVITACION : PLANTILLAS_NOTIFICACION.PARTIDO_COMPLETO,
            payload: { partidoId, reservaId: nueva.id },
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          sedeId: sede.id,
          actorId: sesion.usuarioId,
          accion: 'partido.confirmado',
          entidad: 'Reserva',
          entidadId: nueva.id,
          despues: { partidoId, canchaId: elegida.canchaId, dividir, total: precio.total },
          ip: g.ip,
        },
      });

      return { reservaId: nueva.id };
    });

    const body = { id: resultado.reservaId };
    await g.finish(body);
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'slot_ocupado', message: 'Alguien más tomó ese horario justo ahora. Intenta de nuevo.' }, { status: 409 });
    }
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error('POST /api/partidos/[id]/confirmar', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
