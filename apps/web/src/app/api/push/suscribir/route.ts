import { NextResponse, type NextRequest } from 'next/server';
import { pushSubscriptionSchema } from '@pelotea/shared';
import { prisma } from '@pelotea/db';
import { guard } from '@/lib/guard';
import { getSesion } from '@/lib/session';

export const runtime = 'nodejs';

/** Guarda (o actualiza) la suscripción de Web Push del navegador del usuario. */
export async function POST(req: NextRequest) {
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const g = await guard(req, { preset: 'notify', schema: pushSubscriptionSchema, subject: sesion.usuarioId });
  if (!g.ok) return g.response;
  const { endpoint, keys } = g.data;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { usuarioId: sesion.usuarioId, p256dh: keys.p256dh, auth: keys.auth },
    create: { usuarioId: sesion.usuarioId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(req: NextRequest) {
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const endpoint = new URL(req.url).searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'falta_endpoint' }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, usuarioId: sesion.usuarioId } });
  return NextResponse.json({ ok: true });
}
