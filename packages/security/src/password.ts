import { hash, verify } from '@node-rs/argon2';

/**
 * Hashing de contraseñas con Argon2id. Parámetros alineados con OWASP
 * (>= 19 MiB, t=2, p=1). El hash es self-describing: no hace falta guardar params.
 *
 * `algorithm: 2` es `Algorithm.Argon2id` de `@node-rs/argon2` — ese paquete
 * lo expone como `const enum`, que Next/SWC no puede inlinear con
 * `isolatedModules` (cada archivo se transpila solo, sin ver el valor real
 * del enum de otro paquete). Se usa el número literal a propósito; no es un
 * valor mágico sin explicación.
 */
const OPTS = {
  algorithm: 2, // Algorithm.Argon2id
  memoryCost: 19_456, // KiB (~19 MiB)
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  if (plain.length > 1024) throw new Error('Contraseña demasiado larga.');
  return hash(plain, OPTS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

/**
 * Política de bloqueo progresivo de login. Se combina con el rate-limit `auth`.
 * Devuelve los segundos de espera tras N intentos fallidos consecutivos.
 */
export function loginBackoffSec(intentosFallidos: number): number {
  if (intentosFallidos < 3) return 0;
  if (intentosFallidos < 5) return 30;
  if (intentosFallidos < 8) return 60 * 5;
  if (intentosFallidos < 12) return 60 * 30;
  return 60 * 60 * 24; // lockout de 24 h; requiere reset por email
}
