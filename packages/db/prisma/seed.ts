import { PrismaClient, Deporte, Superficie, Rol } from '@prisma/client';

const prisma = new PrismaClient();

const SLUG = process.env.DEFAULT_SEDE_SLUG ?? 'club-piloto';

async function main() {
  // ── Sede piloto (MVP single-tenant) ──────────────────────────────────────
  const sede = await prisma.sede.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      slug: SLUG,
      nombre: 'Club Piloto La Trinidad',
      timezone: 'America/Caracas',
      direccion: 'La Trinidad, Caracas',
      telefono: '0212-555-0100',
      pagoMovilBanco: '0102 - Banco de Venezuela',
      pagoMovilCedulaRif: 'J-40551203-7',
      pagoMovilTelefono: '0414-555-2210',
      holdMinutos: 15,
      revisionHoras: 2,
      cancelacionHoras: 6,
      precioMoneda: 'USD', // fija tarifas en USD y cobra en Bs al cambio del día
    },
  });

  // ── Tasa de cambio del día (carga MANUAL en producción — esto es solo demo) ──
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  await prisma.tasaCambio.upsert({
    where: { moneda_fecha: { moneda: 'USD', fecha: hoy } },
    update: {},
    create: { moneda: 'USD', fecha: hoy, tasaVES: 190, fuente: 'BCV (demo)' },
  });

  // ── Usuarios base ────────────────────────────────────────────────────────
  await prisma.usuario.upsert({
    where: { email: 'admin@pelotea.app' },
    update: {},
    create: {
      email: 'admin@pelotea.app',
      nombre: 'Admin Plataforma',
      rol: Rol.PLATAFORMA_ADMIN,
      emailVerified: true,
    },
  });

  await prisma.usuario.upsert({
    where: { email: 'club@pelotea.app' },
    update: {},
    create: {
      email: 'club@pelotea.app',
      nombre: 'Dueño del Club',
      rol: Rol.SEDE_ADMIN,
      sedeId: sede.id,
      emailVerified: true,
    },
  });

  const jugador = await prisma.usuario.upsert({
    where: { email: 'jugador@pelotea.app' },
    update: {},
    create: {
      email: 'jugador@pelotea.app',
      nombre: 'Andrea Jugadora',
      rol: Rol.JUGADOR,
      emailVerified: true,
      perfil: {
        create: {
          zona: 'Baruta',
          niveles: {
            create: [{ deporte: Deporte.PADEL, nivel: 'INTERMEDIO' }],
          },
        },
      },
    },
  });

  // ── Canchas ──────────────────────────────────────────────────────────────
  const canchas: Array<{ nombre: string; deporte: Deporte; superficie: Superficie; techada: boolean }> = [
    { nombre: 'Cancha 1', deporte: Deporte.PADEL, superficie: Superficie.CRISTAL, techada: true },
    { nombre: 'Cancha 2', deporte: Deporte.PADEL, superficie: Superficie.CRISTAL, techada: true },
    { nombre: 'Cancha 3', deporte: Deporte.TENIS, superficie: Superficie.ARCILLA, techada: false },
    { nombre: 'Cancha 4', deporte: Deporte.BEACH_TENNIS, superficie: Superficie.ARENA, techada: false },
    { nombre: 'Cancha 5', deporte: Deporte.FUTBOL, superficie: Superficie.SINTETICO, techada: false },
  ];

  for (const [i, c] of canchas.entries()) {
    const cancha = await prisma.cancha.upsert({
      where: { id: `seed-${sede.id}-${i}` },
      update: {},
      create: {
        id: `seed-${sede.id}-${i}`,
        sedeId: sede.id,
        nombre: c.nombre,
        deporte: c.deporte,
        superficie: c.superficie,
        techada: c.techada,
        orden: i,
        capacidad: c.deporte === Deporte.FUTBOL ? 12 : 4,
      },
    });

    // Plantilla: lun-dom, 06:00 a 23:00, precio base por hora.
    for (let dia = 0; dia < 7; dia++) {
      await prisma.plantillaHorario.upsert({
        where: { id: `seed-ph-${cancha.id}-${dia}` },
        update: {},
        create: {
          id: `seed-ph-${cancha.id}-${dia}`,
          sedeId: sede.id,
          canchaId: cancha.id,
          diaSemana: dia,
          horaInicio: 6 * 60,
          horaFin: 23 * 60,
          precioBase: c.deporte === Deporte.FUTBOL ? 15 : 6, // en USD (Sede.precioMoneda)
        },
      });
    }
  }

  // Regla de precio: recargo peak 18:00-22:00 entre semana.
  await prisma.reglaPrecio.upsert({
    where: { id: `seed-rp-peak-${sede.id}` },
    update: {},
    create: {
      id: `seed-rp-peak-${sede.id}`,
      sedeId: sede.id,
      nombre: 'Peak tarde entre semana',
      horaDesde: 18 * 60,
      horaHasta: 22 * 60,
      tipoModificador: 'PORCENTAJE',
      valor: 25,
      prioridad: 10,
    },
  });

  console.log(`✔ Seed listo — sede "${sede.nombre}" (${sede.slug}), ${canchas.length} canchas.`);
  console.log(`  jugador de prueba: ${jugador.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
