import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { transicionarCuota } from '@pelotea/shared';
import { RATE_LIMITS, rateLimit, rateLimitHeaders, idempotency, checkComprobante, safeObjectKey } from '@pelotea/security';
import { redis } from '@/lib/redis';
import { clientIp } from '@/lib/guard';
import { getSesion } from '@/lib/session';
import { subirComprobante } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Un participante del split sube el comprobante de SU cuota.
 * PENDIENTE → PAGADA (queda a la espera de que el staff la apruebe).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: cuotaId } = await params;
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const ip = clientIp(req);
  const rl = await rateLimit(redis, `rl:upload:${sesion.usuarioId}`, RATE_LIMITS.upload);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  const idemKey = req.headers.get('idempotency-key');
  if (!idempotency.isValidIdempotencyKey(idemKey)) {
    return NextResponse.json({ error: 'idempotency_key_required' }, { status: 400 });
  }
  const hit = await idempotency.begin(redis, 'pagar-cuota', idemKey);
  if (hit?.status === 'completed') return NextResponse.json(hit.response ?? {}, { status: 200 });
  if (hit?.status === 'in_progress') return NextResponse.json({ error: 'in_progress' }, { status: 409 });

  try {
    const form = await req.formData();
    const archivo = form.get('archivo');
    const referencia = form.get('referencia');
    if (!(archivo instanceof File)) throw new HttpError(400, 'falta_archivo');

    const buf = new Uint8Array(await archivo.arrayBuffer());
    const chk = checkComprobante(buf, archivo.size);
    if (!chk.ok) throw new HttpError(422, `archivo_invalido: ${chk.reason}`);

    const cuota = await prisma.cuota.findUnique({ where: { id: cuotaId }, include: { reserva: true } });
    if (!cuota) throw new HttpError(404, 'cuota_no_encontrada');
    if (cuota.participanteId !== sesion.usuarioId) throw new HttpError(403, 'sin_permiso');
    if (cuota.estado !== 'PENDIENTE') throw new HttpError(409, `estado_invalido: ${cuota.estado}`);

    const key = safeObjectKey(cuota.reserva.sedeId, cuota.reserva.id, chk.ext);
    await subirComprobante(key, buf, chk.mime);

    const resultado = await prisma.$transaction(async (tx) => {
      const fresh = await tx.cuota.findUnique({ where: { id: cuotaId }, select: { estado: true } });
      if (fresh?.estado !== 'PENDIENTE') throw new HttpError(409, `estado_invalido: ${fresh?.estado}`);

      await tx.pago.create({
        data: {
          sedeId: cuota.reserva.sedeId,
          cuotaId,
          monto: cuota.monto,
          metodo: 'PAGO_MOVIL',
          referencia: typeof referencia === 'string' ? referencia.slice(0, 40) : undefined,
          comprobanteKey: key,
          estado: 'EN_REVISION',
        },
      });
      const actualizada = await tx.cuota.update({
        where: { id: cuotaId },
        data: { estado: transicionarCuota('PENDIENTE', 'PAGADA') },
      });
      await tx.auditLog.create({
        data: {
          sedeId: cuota.reserva.sedeId,
          actorId: sesion.usuarioId,
          accion: 'cuota.comprobante_enviado',
          entidad: 'Cuota',
          entidadId: cuotaId,
          despues: { comprobanteKey: key },
          ip,
        },
      });
      return { id: actualizada.id, estado: actualizada.estado };
    });

    await idempotency.complete(redis, 'pagar-cuota', idemKey, resultado);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    await idempotency.abort(redis, 'pagar-cuota', idemKey);
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/cuotas/[id]/comprobante', err);
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
