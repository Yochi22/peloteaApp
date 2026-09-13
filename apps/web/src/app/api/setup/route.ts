import { NextResponse, type NextRequest } from 'next/server';
import { configurarClubSchema } from '@pelotea/shared';
import { prisma, Prisma } from '@pelotea/db';
import { hashPassword, SESSION_COOKIE } from '@pelotea/security';
import { guard } from '@/lib/guard';
import { crearSesion } from '@/lib/session';
import { invalidarSedeActiva } from '@/lib/sede';

export const runtime = 'nodejs';

/**
 * Crea la Sede activa (slug = DEFAULT_SEDE_SLUG) + su primer SEDE_ADMIN, e
 * inicia sesión de una — el arranque de un club nuevo sin depender del
 * seed/DB directo. Todo lo demás (canchas, horarios, tarifas, moneda) se
 * configura después desde `/panel/*`.
 *
 * **Solo funciona una vez.** Si ya existe una Sede con ese slug, rechaza —
 * si no, cualquiera que encuentre la URL del deploy (antes de que el dueño
 * real se registre) podría crearse un admin. El `slug` es `@unique` en el
 * esquema, así que hasta una carrera de dos requests concurrentes queda
 * resuelta por la propia base (P2002 en el segundo).
 */
export async function POST(req: NextRequest) {
  const g = await guard(req, { preset: 'auth', schema: configurarClubSchema });
  if (!g.ok) return g.response;
  const { sedeNombre, pagoMovilBanco, pagoMovilCedulaRif, pagoMovilTelefono, adminNombre, adminEmail, adminPassword } =
    g.data;

  const slug = process.env.DEFAULT_SEDE_SLUG ?? 'club-piloto';
  const yaExiste = await prisma.sede.findUnique({ where: { slug } });
  if (yaExiste) {
    return NextResponse.json({ error: 'ya_configurado' }, { status: 409 });
  }

  const existente = await prisma.usuario.findUnique({ where: { email: adminEmail } });
  if (existente) {
    return NextResponse.json(
      { error: 'no_se_pudo_registrar', message: 'No se pudo completar el registro con esos datos.' },
      { status: 400 },
    );
  }

  try {
    const hash = await hashPassword(adminPassword);

    const { admin, sede } = await prisma.$transaction(async (tx) => {
      const sede = await tx.sede.create({
        data: {
          slug,
          nombre: sedeNombre,
          timezone: 'America/Caracas',
          pagoMovilBanco,
          pagoMovilCedulaRif,
          pagoMovilTelefono,
        },
      });
      const admin = await tx.usuario.create({
        data: {
          nombre: adminNombre,
          email: adminEmail,
          telefono: pagoMovilTelefono, // mejor un teléfono real que ninguno; lo puede cambiar después
          hashPassword: hash,
          rol: 'SEDE_ADMIN',
          sedeId: sede.id,
          emailVerified: true,
        },
      });
      await tx.auditLog.create({
        data: {
          sedeId: sede.id,
          actorId: admin.id,
          accion: 'sede.configuracion_inicial',
          entidad: 'Sede',
          entidadId: sede.id,
          despues: { nombre: sede.nombre },
          ip: g.ip,
        },
      });
      return { admin, sede };
    });

    invalidarSedeActiva();

    const ua = req.headers.get('user-agent');
    const { token, expiraEn, maxAgeSec } = await crearSesion(admin.id, admin.rol, g.ip, ua);

    const res = NextResponse.json({ id: admin.id, sedeId: sede.id }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiraEn,
      maxAge: maxAgeSec,
    });
    return res;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'ya_configurado' }, { status: 409 });
    }
    console.error('POST /api/setup', err);
    return NextResponse.json({ error: 'error_interno' }, { status: 500 });
  }
}
