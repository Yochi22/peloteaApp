import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { getSesion } from '@/lib/session';

export const runtime = 'nodejs';

/** Marca una notificación IN_APP como leída. Solo el dueño puede marcarla. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await getSesion(req);
  if (!sesion) return NextResponse.json({ error: 'no_autenticado' }, { status: 401 });

  const n = await prisma.notificacion.findUnique({ where: { id } });
  if (!n || n.usuarioId !== sesion.usuarioId) {
    return NextResponse.json({ error: 'no_encontrada' }, { status: 404 });
  }

  await prisma.notificacion.update({ where: { id }, data: { leidaEn: new Date() } });
  return NextResponse.json({ ok: true }, { status: 200 });
}
