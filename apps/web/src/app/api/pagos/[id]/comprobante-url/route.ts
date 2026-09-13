import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@pelotea/db';
import { getSesion, requireRol } from '@/lib/session';
import { urlFirmadaComprobante } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * URL firmada (corta duración) para que el staff vea el comprobante de un
 * pago. Nunca se sirve el archivo directo ni queda público — ver
 * SECURITY.md §2.8.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pagoId } = await params;
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const pago = await prisma.pago.findUnique({ where: { id: pagoId } });
  if (!pago || !pago.comprobanteKey) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 });
  if (sesion!.rol !== 'PLATAFORMA_ADMIN' && sesion!.sedeId !== pago.sedeId) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 });
  }

  const url = await urlFirmadaComprobante(pago.comprobanteKey, 120);
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
}
