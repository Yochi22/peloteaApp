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

    // Todo jugador con perfil recibe la notificación IN_APP (pasiva, sin
    // opt-in) — push/email quedan atrás del opt-in de cada quien porque esos
    // sí interrumpen.
    const candidatos = await prisma.perfilJugador.findMany({
      select: { usuarioId: true, recibeOfertasPush: true, recibeOfertasEmail: true },
      take: 500,
    });

    const plantilla =
      oferta.tipo === 'LAST_MINUTE' ? PLANTILLAS_NOTIFICACION.OFERTA_LAST_MINUTE : PLANTILLAS_NOTIFICACION.OFERTA_EXPRES;

    for (const c of candidatos) {
      // IN_APP siempre, sin importar el opt-in — es el canal pasivo (el
      // jugador lo ve si entra a revisar, nunca lo interrumpe), así que no
      // tiene el mismo riesgo de spam que push/email. Antes esto era el
      // único hueco real: la oferta se creaba en la base pero nadie la veía
      // nunca, ni el jugador ni el admin, porque ninguna pantalla la leía.
      const canales: Array<'WEB_PUSH' | 'EMAIL' | 'IN_APP'> = [
        'IN_APP',
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
