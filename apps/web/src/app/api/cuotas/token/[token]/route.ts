import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { RATE_LIMITS, rateLimit, rateLimitHeaders } from '@pelotea/security';
import { redis } from '@/lib/redis';
import { clientIp } from '@/lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_RE = /^[0-9a-fA-F-]{16,64}$/;

/**
 * Consulta pública de una cuota por su `inviteToken` — así paga un invitado
 * del split SIN tener cuenta en Pelotea. El token es el único secreto: es un
 * UUID v4 (122 bits de entropía), impracticable de adivinar; aun así el
 * endpoint lleva rate-limit por IP como defensa en profundidad.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const rl = await rateLimit(redis, `rl:global:${clientIp(req)}`, RATE_LIMITS.global);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rateLimitHeaders(rl) });

  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 });

  const cuota = await prisma.cuota.findUnique({
    where: { inviteToken: token },
    include: { reserva: { include: { cancha: { include: { sede: true } } } } },
  });
  if (!cuota) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 });

  return NextResponse.json(
    {
      monto: Number(cuota.monto),
      estado: cuota.estado,
      nombreInvitado: cuota.nombreInvitado,
      reserva: {
        inicio: cuota.reserva.inicio,
        fin: cuota.reserva.fin,
        cancha: cuota.reserva.cancha.nombre,
        sede: cuota.reserva.cancha.sede.nombre,
      },
      pagoMovil: {
        banco: cuota.reserva.cancha.sede.pagoMovilBanco,
        cedulaRif: cuota.reserva.cancha.sede.pagoMovilCedulaRif,
        telefono: cuota.reserva.cancha.sede.pagoMovilTelefono,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
