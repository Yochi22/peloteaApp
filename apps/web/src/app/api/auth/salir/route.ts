import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@pelotea/security';
import { cerrarSesion } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  await cerrarSesion(token);

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
