/** Token opaco de sesión: 256 bits, hex. No es JWT — se busca en DB por índice único. */
export function newSessionToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export const SESSION_COOKIE = 'pl_session';
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 días (jugadores)
export const SESSION_TTL_ADMIN_SEC = 60 * 60 * 8; // 8 h (roles admin/staff)
