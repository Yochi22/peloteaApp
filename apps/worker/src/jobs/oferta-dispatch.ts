import type { Job } from 'bullmq';
import { prisma, type Deporte } from '@pelotea/db';
import { PLANTILLAS_NOTIFICACION } from '@pelotea/shared';

/**
 * Despacha ofertas EXPRES/LAST_MINUTE activas que aún no generaron
 * notificaciones. Fan-out a jugadores opt-in (`recibeOfertasPush` /
 * `recibeOfertasEmail`) — NUNCA por WhatsApp (ver CLAUDE.md §4).
 *
 * Audiencia real: jugadores con nivel cargado en el deporte de la cancha de
 * la oferta (o en `filtros.deportes` si viene más acotado), filtrados por
 * `filtros.zonas` si vienen, y por opt-in (`recibeOfertasPush`/
 * `recibeOfertasEmail`) si `filtros.soloOptIn` viene en true. Antes esto
 * mandaba a CUALQUIER jugador con perfil sin mirar ninguno de estos campos
 * — alguien que solo juega fútbol recibía la oferta de pádel de otra sede.
 */
export async function procesarOfertaDispatch(_job: Job): Promise<void> {
  const ahora = new Date();

  const ofertas = await prisma.oferta.findMany({
    where: { estado: 'ACTIVA', ventanaFin: { gt: ahora } },
    take: 50,
  });

  for (const oferta of ofertas) {
    if (oferta.tomada >= oferta.cupo) continue; // agotada: la marca el endpoint que la toma
    // Idempotencia simple: no reenviar si ya hay una notificación de esta oferta.
    const yaNotificada = await prisma.notificacion.findFirst({
      where: { payload: { path: ['ofertaId'], equals: oferta.id } },
      select: { id: true },
    });
    if (yaNotificada) continue;

    if (oferta.ventanaFin <= ahora) {
      await prisma.oferta.update({ where: { id: oferta.id }, data: { estado: 'VENCIDA' } });
      continue;
    }

    const filtros = (oferta.filtros as { deportes?: string[]; zonas?: string[]; soloOptIn?: boolean } | null) ?? {};
    const cancha = await prisma.cancha.findUnique({ where: { id: oferta.canchaId } });
    if (!cancha) continue;
    if (filtros.deportes?.length && !filtros.deportes.includes(cancha.deporte)) continue;

    const deportesObjetivo = (filtros.deportes?.length ? filtros.deportes : [cancha.deporte]) as Deporte[];
    const candidatos = await prisma.perfilJugador.findMany({
      where: {
        niveles: { some: { deporte: { in: deportesObjetivo } } },
        ...(filtros.zonas?.length ? { zona: { in: filtros.zonas } } : {}),
        ...(filtros.soloOptIn ? { OR: [{ recibeOfertasPush: true }, { recibeOfertasEmail: true }] } : {}),
      },
      select: { usuarioId: true },
      take: 500,
    });

    const plantilla =
      oferta.tipo === 'LAST_MINUTE' ? PLANTILLAS_NOTIFICACION.OFERTA_LAST_MINUTE : PLANTILLAS_NOTIFICACION.OFERTA_EXPRES;

    for (const c of candidatos) {
      for (const canal of ['IN_APP'] as const) {
        await prisma.notificacion.create({
          data: {
            usuarioId: c.usuarioId,
            canal,
            plantilla,
            payload: { ofertaId: oferta.id, canchaId: oferta.canchaId, precioFinal: String(oferta.precioFinal) },
          },
        });
      }
    }
  }
}
