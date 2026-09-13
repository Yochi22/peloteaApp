import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { transicionarCuota } from '@pelotea/shared';
import { RATE_LIMITS, rateLimit, rateLimitHeaders, idempotency, checkComprobante, safeObjectKey } from '@pelotea/security';
import { redis } from '@/lib/redis';
import { clientIp } from '@/lib/guard';
import { subirComprobante } from '@/lib/storage';

export const runtime = 'nodejs';

const TOKEN_RE = /^[0-9a-fA-F-]{16,64}$/;

/**
 * Un invitado SIN CUENTA paga su parte del split subiendo el comprobante
 * contra su `inviteToken` (nadie inicia sesión). Mismas defensas que el
 * comprobante de una reserva normal: magic-bytes, rate-limit, idempotencia.
 * El rate-limit y la idempotencia se anclan al token (no hay `usuarioId`).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 });

  const ip = clientIp(req);
  const rl = await rateLimit(redis, `rl:upload:token:${token}`, RATE_LIMITS.upload);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  const idemKey = req.headers.get('idempotency-key');
  if (!idempotency.isValidIdempotencyKey(idemKey)) {
    return NextResponse.json({ error: 'idempotency_key_required' }, { status: 400 });
  }
  const hit = await idempotency.begin(redis, `pagar-cuota-invitado:${token}`, idemKey);
  if (hit?.status === 'completed') return NextResponse.json(hit.response ?? {}, { status: 200 });
  if (hit?.status === 'in_progress') return NextResponse.json({ error: 'in_progress' }, { status: 409 });

  try {
    const form = await req.formData();
    const archivo = form.get('archivo');
    const referencia = form.get('referencia');
    const nombre = form.get('nombre');
    if (!(archivo instanceof File)) throw new HttpError(400, 'falta_archivo');

    const buf = new Uint8Array(await archivo.arrayBuffer());
    const chk = checkComprobante(buf, archivo.size);
    if (!chk.ok) throw new HttpError(422, `archivo_invalido: ${chk.reason}`);

    const cuota = await prisma.cuota.findUnique({ where: { inviteToken: token }, include: { reserva: true } });
    if (!cuota) throw new HttpError(404, 'no_encontrado');
    if (cuota.estado !== 'PENDIENTE') throw new HttpError(409, `estado_invalido: ${cuota.estado}`);

    const key = safeObjectKey(cuota.reserva.sedeId, cuota.reserva.id, chk.ext);
    await subirComprobante(key, buf, chk.mime);

    const resultado = await prisma.$transaction(async (tx) => {
      const fresh = await tx.cuota.findUnique({ where: { id: cuota.id }, select: { estado: true } });
      if (fresh?.estado !== 'PENDIENTE') throw new HttpError(409, `estado_invalido: ${fresh?.estado}`);

      await tx.pago.create({
        data: {
          sedeId: cuota.reserva.sedeId,
          cuotaId: cuota.id,
          monto: cuota.monto,
          metodo: 'PAGO_MOVIL',
          referencia: typeof referencia === 'string' ? referencia.slice(0, 40) : undefined,
          comprobanteKey: key,
          estado: 'EN_REVISION',
        },
      });
      const actualizada = await tx.cuota.update({
        where: { id: cuota.id },
        data: {
          estado: transicionarCuota('PENDIENTE', 'PAGADA'),
          nombreInvitado: typeof nombre === 'string' ? nombre.slice(0, 80) : cuota.nombreInvitado,
        },
      });
      await tx.auditLog.create({
        data: {
          sedeId: cuota.reserva.sedeId,
          accion: 'cuota.comprobante_enviado',
          entidad: 'Cuota',
          entidadId: cuota.id,
          despues: { comprobanteKey: key, viaInvitado: true },
          ip,
        },
      });
      return { id: actualizada.id, estado: actualizada.estado };
    });

    await idempotency.complete(redis, `pagar-cuota-invitado:${token}`, idemKey, resultado);
    return NextResponse.json(resultado, { status: 200 });
  } catch (err) {
    await idempotency.abort(redis, `pagar-cuota-invitado:${token}`, idemKey);
    if (err instanceof HttpError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error('POST /api/cuotas/token/[token]/comprobante', err);
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
