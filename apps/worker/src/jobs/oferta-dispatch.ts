import type { Job } from 'bullmq';
import { prisma } from '@pelotea/db';
import { PLANTILLAS_NOTIFICACION } from '@pelotea/shared';

/**
 * Despacha ofertas EXPRES/LAST_MINUTE activas que aún no generaron
 * notificaciones. Fan-out a jugadores opt-in (`recibeOfertasPush` /
 * `recibeOfertasEmail`) — NUNCA por WhatsApp (ver CLAUDE.md §4).
 *
 * Matching v1 (a refinar en Fase 4): todo jugador opt-in de la sede/zona; el
 * filtro por deporte de `filtros.deportes` se aplica si viene seteado.
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

    const filtros = (oferta.filtros as { deportes?: string[]; soloOptIn?: boolean } | null) ?? {};
    const cancha = await prisma.cancha.findUnique({ where: { id: oferta.canchaId } });
    if (!cancha) continue;
    if (filtros.deportes?.length && !filtros.deportes.includes(cancha.deporte)) continue;

    const candidatos = await prisma.perfilJugador.findMany({
      where: {
        OR: [{ recibeOfertasPush: true }, { recibeOfertasEmail: true }],
      },
      select: { usuarioId: true, recibeOfertasPush: true, recibeOfertasEmail: true },
      take: 500,
    });

    const plantilla =
      oferta.tipo === 'LAST_MINUTE' ? PLANTILLAS_NOTIFICACION.OFERTA_LAST_MINUTE : PLANTILLAS_NOTIFICACION.OFERTA_EXPRES;

    for (const c of candidatos) {
      const canales: Array<'WEB_PUSH' | 'EMAIL'> = [
        ...(c.recibeOfertasPush ? (['WEB_PUSH'] as const) : []),
        ...(c.recibeOfertasEmail ? (['EMAIL'] as const) : []),
      ];
      for (const canal of canales) {
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
