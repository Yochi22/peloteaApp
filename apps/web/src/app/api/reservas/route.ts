import { NextResponse, type NextRequest } from 'next/server';
import { crearReservaSchema, transicionar, dividirEnCuotas, MAX_RESERVAS_ACTIVAS_SIN_CONFIRMAR } from '@pelotea/shared';
import { prisma, Prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';
import { calcularPrecioReserva, HttpError } from '@/lib/precio-reserva';

export const runtime = 'nodejs';

/**
 * Crea una reserva en estado PENDIENTE_PAGO y toma el HOLD del slot.
 *
 * **Reservar NO exige cuenta**: sin sesión, se acepta como invitado (nombre +
 * teléfono, email opcional) — se crea un Usuario marcado `esInvitado`, sin
 * perfil de jugador (así queda afuera del fan-out de ofertas/descuentos, que
 * son beneficio de cuenta). El acceso a SU reserva es por `accessToken`
 * (como el `inviteToken` de las cuotas), nunca por login.
 *
 * **Dividir el pago SÍ exige cuenta** (se valida en el esquema y de nuevo
 * acá): armar un split, invitar gente y hacer seguimiento es una feature de
 * cuenta registrada — igual que crear/unirse a partidos abiertos y recibir
 * ofertas de última hora.
 *
 * El precio y el abono se calculan con `calcularPrecioReserva()`
 * (`@/lib/precio-reserva`) — misma función que usa el auto-booking cuando un
 * partido abierto se llena, para no tener dos lugares calculando dinero.
 *
 * Defensas: rate-limit (`mutation` autenticado / `guestBooking` invitado —
 * más estricto, porque una reserva de invitado crea Usuario Y toma un HOLD
 * real sin ninguna verificación previa), idempotencia, Zod, transacción
 * atómica, y el @@unique de SlotLock (una fila por unidad base) contra la
 * doble reserva concurrente.
 */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);

  const g = await guard(req, {
    preset: sesion ? 'mutation' : 'guestBooking',
    schema: crearReservaSchema,
    idempotencyScope: 'crear-reserva',
    subject: sesion?.usuarioId,
  });
  if (!g.ok) return g.response;

  const { canchaId, inicioISO, dividir, invitado, duracionMin } = g.data;

  if (!sesion && dividir) {
    return NextResponse.json(
      { error: 'cuenta_requerida', message: 'Dividir el pago requiere crear una cuenta gratis.' },
      { status: 403 },
    );
  }
  if (!sesion && !invitado) {
    return NextResponse.json({ error: 'faltan_datos_invitado' }, { status: 400 });
  }

  const sede = await getSedeActiva();
  const inicio = new Date(inicioISO);

  // Anti-abuso: sin este tope, una cuenta podía apartar (HOLD) muchos turnos
  // a la vez sin pagar ninguno, dejando la agenda del club bloqueada 15 min
  // por reserva "fantasma". Los invitados no tienen este límite (cada uno
  // crea un Usuario nuevo) — para ellos el freno es el rate-limit
  // `guestBooking` por IP.
  if (sesion) {
    const activas = await prisma.reserva.count({
      where: {
        organizadorId: sesion.usuarioId,
        estado: { in: ['PENDIENTE_PAGO', 'COMPROBANTE_ENVIADO', 'EN_REVISION'] },
      },
    });
    if (activas >= MAX_RESERVAS_ACTIVAS_SIN_CONFIRMAR) {
      return NextResponse.json(
        {
          error: 'demasiadas_reservas_pendientes',
          message: 'Ya tienes reservas sin confirmar. Completa o cancela alguna antes de crear otra.',
        },
        { status: 409 },
      );
    }
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const cancha = await tx.cancha.findFirst({ where: { id: canchaId, sedeId: sede.id, activa: true } });
      if (!cancha) throw new HttpError(404, 'cancha_no_encontrada');

      const precio = await calcularPrecioReserva(tx, sede, cancha, inicio, duracionMin, { esSplit: !!dividir });

      // Organizador: la sesión, o un Usuario invitado nuevo (sin PerfilJugador
      // — no participa del matching de ofertas ni de partidos abiertos).
      let organizadorId = sesion?.usuarioId;
      let accessToken: string | null = null;
      if (!organizadorId) {
        const guest = await tx.usuario.create({
          data: {
            nombre: invitado!.nombre,
            telefono: invitado!.telefono,
            email: invitado!.email ?? null,
            rol: 'JUGADOR',
            esInvitado: true,
          },
        });
        organizadorId = guest.id;
        accessToken = crypto.randomUUID();
      }

      const nueva = await tx.reserva.create({
        data: {
          sedeId: sede.id,
          canchaId,
          organizadorId,
          inicio,
          fin: precio.fin,
          estado: transicionar('BORRADOR', 'INICIAR_PAGO'),
          canal: 'WEB',
          precioTotal: new Prisma.Decimal(precio.total),
          montoServicio: new Prisma.Decimal(precio.montoServicio),
          montoAbono: new Prisma.Decimal(precio.montoAbono),
          montoRestante: new Prisma.Decimal(precio.montoRestante),
          precioTotalRef: new Prisma.Decimal(precio.totalRef),
          monedaRef: precio.monedaRef,
          tasaCambio: new Prisma.Decimal(precio.tasaCambio),
          esDividida: !!dividir,
          accessToken,
          holdExpiraEn: new Date(Date.now() + sede.holdMinutos * 60_000),
        },
      });

      // Toma el HOLD: una fila por unidad base. `Cancha.cantidad` puede
      // agrupar varias canchas físicas idénticas ("pool" — ver
      // Cancha.cantidad en el schema), así que por cada hora hay que
      // reclamar un `unidad` (1..cantidad) que esté libre a ESA hora, no
      // asumir que siempre es la 1. Si no queda ninguna libre (alguien se
      // adelantó) o dos requests concurrentes eligen la misma → P2002 (unique
      // canchaId+inicio+unidad) y la transacción entera se revierte — no
      // queda un HOLD "a medias" sobre parte del rango.
      const dataLocks = [];
      for (const inicioUnidad of precio.inicios) {
        const tomados = await tx.slotLock.findMany({
          where: { canchaId, inicio: inicioUnidad, expiraEn: { gt: new Date() } },
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
        if (!unidad) throw new HttpError(409, 'slot_ocupado');
        dataLocks.push({
          sedeId: sede.id,
          canchaId,
          inicio: inicioUnidad,
          fin: new Date(inicioUnidad.getTime() + cancha.duracionTurnoMin * 60_000),
          unidad,
          reservaId: nueva.id,
          expiraEn: nueva.holdExpiraEn!,
        });
      }
      await tx.slotLock.createMany({ data: dataLocks });

      let cuotas: Array<{ id: string; monto: number; esOrganizador: boolean; inviteToken: string | null }> = [];
      if (dividir) {
        const montos = dividirEnCuotas(precio.total, dividir.participantes);
        const filas = await Promise.all(
          montos.map((monto, i) =>
            tx.cuota.create({
              data: {
                reservaId: nueva.id,
                monto: new Prisma.Decimal(monto),
                esOrganizador: i === 0,
                participanteId: i === 0 ? organizadorId : null,
                // Invitado del split (sin cuenta): token de un solo uso para su link público.
                inviteToken: i === 0 ? null : crypto.randomUUID(),
              },
            }),
          ),
        );
        cuotas = filas.map((c) => ({
          id: c.id,
          monto: Number(c.monto),
          esOrganizador: c.esOrganizador,
          inviteToken: c.inviteToken,
        }));
      }

      await tx.auditLog.create({
        data: {
          sedeId: sede.id,
          actorId: sesion?.usuarioId,
          accion: sesion ? 'reserva.creada' : 'reserva.creada_invitado',
          entidad: 'Reserva',
          entidadId: nueva.id,
          despues: { estado: nueva.estado, canchaId, inicio: inicio.toISOString(), dividida: !!dividir },
          ip: g.ip,
        },
      });

      return { reserva: nueva, cuotas };
    });

    const body = {
      id: resultado.reserva.id,
      estado: resultado.reserva.estado,
      precioTotal: Number(resultado.reserva.precioTotal),
      montoAbono: Number(resultado.reserva.montoAbono),
      montoRestante: Number(resultado.reserva.montoRestante),
      precioTotalRef: Number(resultado.reserva.precioTotalRef),
      monedaRef: resultado.reserva.monedaRef,
      tasaCambio: Number(resultado.reserva.tasaCambio),
      holdExpiraEn: resultado.reserva.holdExpiraEn,
      // Solo para invitados: su acceso a la reserva sin necesidad de login.
      accessToken: resultado.reserva.accessToken,
      linkComprobante: resultado.reserva.accessToken
        ? `${process.env.APP_BASE_URL ?? ''}/reservas/${resultado.reserva.id}/comprobante?token=${resultado.reserva.accessToken}`
        : null,
      // Links de pago para compartir con los invitados del split (sin cuenta).
      cuotas: resultado.cuotas.map((c) => ({
        id: c.id,
        monto: c.monto,
        esOrganizador: c.esOrganizador,
        linkPago: c.inviteToken ? `${process.env.APP_BASE_URL ?? ''}/pagar/${c.inviteToken}` : null,
      })),
    };
    await g.finish(body);
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'slot_ocupado', message: 'Ese horario ya fue tomado. Elige otro.' },
        { status: 409 },
      );
    }
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error('POST /api/reservas', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
