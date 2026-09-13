import { redirect } from 'next/navigation';
import { getSesionServer } from './session-server';
import type { Sesion } from './session';

const ROLES_PANEL: Sesion['rol'][] = ['SEDE_STAFF', 'SEDE_ADMIN', 'PLATAFORMA_ADMIN'];
const ROLES_2FA_OBLIGATORIO: Sesion['rol'][] = ['SEDE_ADMIN', 'PLATAFORMA_ADMIN'];

/**
 * Acceso a cualquier página de `/panel/*`: exige sesión + rol de staff/admin
 * y, para SEDE_ADMIN/PLATAFORMA_ADMIN, 2FA activo — bloqueo real (redirect),
 * no un aviso descartable. SEDE_STAFF queda afuera de esa exigencia (solo
 * aprueba/rechaza pagos, no toca configuración ni dinero de la sede). El
 * mismo criterio se aplica en las rutas de API vía `requireRol` (session.ts).
 */
export async function requireSesionPanel(pathname: string): Promise<Sesion> {
  const sesion = await getSesionServer();
  if (!sesion || !ROLES_PANEL.includes(sesion.rol)) {
    redirect(`/entrar?next=${encodeURIComponent(pathname)}`);
  }
  if (ROLES_2FA_OBLIGATORIO.includes(sesion.rol) && !sesion.twoFactorEnabled) {
    redirect(`/cuenta/2fa?next=${encodeURIComponent(pathname)}&obligatorio=1`);
  }
  return sesion;
}
