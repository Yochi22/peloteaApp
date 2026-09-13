import { cookies } from 'next/headers';
import { prisma, type Rol } from '@pelotea/db';
import { SESSION_COOKIE } from '@pelotea/security';
import type { Sesion } from './session';

/** Igual que `getSesion`, pero para Server Components (usa `cookies()` de Next). */
export async function getSesionServer(): Promise<Sesion | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await prisma.sesion.findUnique({
    where: { token },
    select: { expiraEn: true, usuario: { select: { id: true, rol: true, sedeId: true, twoFactorEnabled: true } } },
  });
  if (!row || row.expiraEn.getTime() < Date.now()) return null;

  return {
    usuarioId: row.usuario.id,
    rol: row.usuario.rol as Rol,
    sedeId: row.usuario.sedeId,
    twoFactorEnabled: row.usuario.twoFactorEnabled,
  };
}
