import type { NextRequest } from 'next/server';
import { prisma, type Rol } from '@pelotea/db';
import { newSessionToken, SESSION_COOKIE, SESSION_TTL_SEC, SESSION_TTL_ADMIN_SEC } from '@pelotea/security';

/**
 * Sesión con token opaco en cookie (no JWT): se busca por índice único en
 * `Sesion`, así se puede revocar server-side (logout, ban, cambio de password)
 * sin esperar una expiración.
 */

export interface Sesion {
  usuarioId: string;
  rol: Rol;
  sedeId: string | null;
  twoFactorEnabled: boolean;
}

export async function getSesion(req: NextRequest): Promise<Sesion | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = await prisma.sesion.findUnique({
    where: { token },
    select: { expiraEn: true, usuario: { select: { id: true, rol: true, sedeId: true, twoFactorEnabled: true } } },
  });
  if (!row || row.expiraEn.getTime() < Date.now()) return null;

  return {
    usuarioId: row.usuario.id,
    rol: row.usuario.rol,
    sedeId: row.usuario.sedeId,
    twoFactorEnabled: row.usuario.twoFactorEnabled,
  };
}

const ROLES_2FA_OBLIGATORIO: Rol[] = ['SEDE_ADMIN', 'PLATAFORMA_ADMIN'];

/**
 * Exige uno de los roles dados; lanza si no hay sesión o el rol no matchea.
 * Además, para SEDE_ADMIN/PLATAFORMA_ADMIN exige 2FA activo — bloqueo real
 * a nivel de API (no solo un aviso en la UI): alguien con esos roles no
 * puede llamar el endpoint directo saltándose el panel. SEDE_STAFF queda
 * afuera (solo aprueba/rechaza pagos, no mueve configuración de la sede).
 */
export function requireRol(sesion: Sesion | null, ...roles: Rol[]): Sesion {
  if (!sesion) throw new Error('no_autenticado');
  if (roles.length && !roles.includes(sesion.rol)) throw new Error('sin_permiso');
  if (ROLES_2FA_OBLIGATORIO.includes(sesion.rol) && !sesion.twoFactorEnabled) {
    throw new Error('2fa_requerido');
  }
  return sesion;
}

export interface NuevaSesion {
  token: string;
  expiraEn: Date;
  maxAgeSec: number;
}

/** Crea la fila de sesión. TTL corto para roles admin/staff (superficie de ataque menor). */
export async function crearSesion(
  usuarioId: string,
  rol: Rol,
  ip: string | null,
  userAgent: string | null,
): Promise<NuevaSesion> {
  const maxAgeSec = rol === 'JUGADOR' ? SESSION_TTL_SEC : SESSION_TTL_ADMIN_SEC;
  const token = newSessionToken();
  const expiraEn = new Date(Date.now() + maxAgeSec * 1000);
  await prisma.sesion.create({ data: { usuarioId, token, ip, userAgent, expiraEn } });
  return { token, expiraEn, maxAgeSec };
}

export async function cerrarSesion(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.sesion.deleteMany({ where: { token } });
}
