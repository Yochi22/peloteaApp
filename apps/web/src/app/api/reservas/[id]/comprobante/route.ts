import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { transicionar } from '@pelotea/shared';
import { RATE_LIMITS, rateLimit, rateLimitHeaders, idempotency, checkComprobante, safeObjectKey } from '@pelotea/security';
import { redis } from '@/lib/redis';
import { clientIp } from '@/lib/guard';
import { getSesion } from '@/lib/session';
import { puedeAccederReserva } from '@/lib/acceso-reserva';
import { subirComprobante } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Recibe el comprobante de pago móvil (multipart/form-data: `archivo`,
 * `referencia?`). PENDIENTE_PAGO → COMPROBANTE_ENVIADO. Acepta al organizador
 * con sesión O a un invitado con el `?token=` de su reserva (ver
 * `puedeAccederReserva`). Subir el comprobante NO aprueba nada — solo pone la
 * reserva en cola; un humano del club la revisa en `/api/pagos/[id]/resolver`.
 * Defensas: rate-limit `upload`, idempotencia, magic-bytes + tamaño, ownership.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: reservaId } = await params;
  const sesion = await getSesion(req);
  const tokenQuery = new URL(req.url).searchParams.get('token');

  const ip = clientIp(req);
  const rl = await rateLimit(redis, `rl:upload:${sesion?.usuarioId ?? ip}`, RATE_LIMITS.upload);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Demasiados envíos. Espera un momento.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const idemKey = req.headers.get('idempotency-key');
  if (!idempotency.isValidIdempotencyKey(idemKey)) {
    return NextResponse.json({ error: 'idempotency_key_required' }, { status: 400 });
  }
  const hit = await idempotency.begin(redis, 'enviar-comprobante', idemKey);
  if (hit?.status === 'completed') return NextResponse.json(hit.response ?? {}, { status: 200 });
  if (hit?.status === 'in_progress') {
    return NextResponse.json({ error: 'in_progress' }, { status: 409 });
  }

  try {
    const form = await req.formData();
    const archivo = form.get('archivo');
    const referencia = form.get('referencia');
    if (!(archivo instanceof File)) {
      throw new HttpError(400, 'falta_archivo');
    }

    const buf = new Uint8Array(await archivo.arrayBuffer());
    const chk = checkComprobante(buf, archivo.size);
    if (!chk.ok) throw new HttpError(422, `archivo_invalido: ${chk.reason}`);

    const reserva = await prisma.reserva.findUnique({ where: { id: reservaId } });
    if (!reserva) throw new HttpError(404, 'reserva_no_encontrada');
    if (!puedeAccederReserva(sesion, reserva, tokenQuery)) {
      // Los participantes de un split suben su comprobante contra su Cuota,
      // no acá — este endpoint es del organizador. Ver /api/cuotas/[id]/comprobante.
      throw new HttpError(403, 'sin_permiso');
    }
    if (reserva.estado !== 'PENDIENTE_PAGO') {
      throw new HttpError(409, `estado_invalido: la reserva está en ${reserva.estado}`);
    }

    const key = safeObjectKey(reserva.sedeId, reserva.id, chk.ext);
    await subirComprobante(key, buf, chk.mime);

    const sede = await prisma.sede.findUniqueOrThrow({ where: { id: reserva.sedeId } });
    const revisionExpiraEn = new Date(Date.now() + sede.revisionHoras * 3_600_000);

    const actualizada = await prisma.$transaction(async (tx) => {
      const fresh = await tx.reserva.findUnique({ where: { id: reservaId }, select: { estado: true } });
      if (fresh?.estado !== 'PENDIENTE_PAGO') {
        throw new HttpError(409, `estado_invalido: la reserva está en ${fresh?.estado ?? 'desconocido'}`);
      }

      // EN_REVISION, no APROBADO: queda a la espera de que un humano del club
      // (staff/admin) lo revise y decida — nunca se aprueba solo por subirse.
      await tx.pago.create({
        data: {
          sedeId: reserva.sedeId,
          reservaId: reserva.id,
          // El comprobante cubre el ABONO, no el total — si la reserva
          // tiene pago parcial, el resto se cobra en sitio (ver §3 CLAUDE.md).
          monto: reserva.montoAbono,
          metodo: 'PAGO_MOVIL',
          referencia: typeof referencia === 'string' ? referencia.slice(0, 40) : undefined,
          comprobanteKey: key,
          estado: 'EN_REVISION',
        },
      });

      const upd = await tx.reserva.update({
        where: { id: reservaId },
        data: {
          estado: transicionar('PENDIENTE_PAGO', 'ENVIAR_COMPROBANTE'),
          revisionExpiraEn,
        },
      });

      await tx.slotLock.updateMany({ where: { reservaId }, data: { expiraEn: revisionExpiraEn } });

      await tx.auditLog.create({
        data: {
          sedeId: reserva.sedeId,
          actorId: sesion?.usuarioId ?? reserva.organizadorId,
          accion: 'reserva.comprobante_enviado',
          entidad: 'Reserva',
          entidadId: reservaId,
          despues: { comprobanteKey: key },
          ip,
        },
      });

      return upd;
    });

    const body = { id: actualizada.id, estado: actualizada.estado, revisionExpiraEn: actualizada.revisionExpiraEn };
    await idempotency.complete(redis, 'enviar-comprobante', idemKey, body);
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    await idempotency.abort(redis, 'enviar-comprobante', idemKey);
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error('POST /api/reservas/[id]/comprobante', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
