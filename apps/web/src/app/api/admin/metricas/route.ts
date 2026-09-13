import { NextResponse, type NextRequest } from 'next/server';
import { rangoFechasSchema } from '@pelotea/shared';
import { getSesion, requireRol } from '@/lib/session';
import { getSedeActiva } from '@/lib/sede';
import { calcularMetricas } from '@/lib/metricas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Métricas del panel del dueño. Solo staff/admin de la sede. Ver `@/lib/metricas`. */
export async function GET(req: NextRequest) {
  const sesion = await getSesion(req);
  try {
    requireRol(sesion, 'SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN');
  } catch (err) {
    const codigo = err instanceof Error && err.message === '2fa_requerido' ? '2fa_requerido' : 'sin_permiso';
    return NextResponse.json({ error: codigo }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = rangoFechasSchema.safeParse({
    desdeISO: url.searchParams.get('desde') ?? undefined,
    hastaISO: url.searchParams.get('hasta') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 422 });

  const sede = await getSedeActiva();
  const desde = parsed.data.desdeISO ? new Date(parsed.data.desdeISO) : new Date(Date.now() - 30 * 86_400_000);
  const hasta = parsed.data.hastaISO ? new Date(parsed.data.hastaISO) : new Date();

  const metricas = await calcularMetricas(sede.id, desde, hasta);
  return NextResponse.json(metricas, { headers: { 'Cache-Control': 'no-store' } });
}
