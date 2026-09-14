import { z } from 'zod';
import { DEPORTES, SUPERFICIES } from '../constants';

/** Fuente de verdad de validación. Los tipos se derivan de acá. */

export const idSchema = z.string().min(1).max(64);

export const emailSchema = z.string().email().toLowerCase().max(160);

/** Teléfono venezolano flexible: acepta 0414..., +58414..., con o sin guiones. */
export const telefonoVeSchema = z
  .string()
  .trim()
  .regex(/^(\+?58|0)?\s?4\d{2}[\s-]?\d{3}[\s-]?\d{2,4}$/, 'Teléfono inválido');

export const deporteSchema = z.enum(DEPORTES);
export const superficieSchema = z.enum(SUPERFICIES);

// ── Reserva ────────────────────────────────────────────────────────────────

export const crearReservaSchema = z
  .object({
    canchaId: idSchema,
    inicioISO: z.string().datetime(),
    // Cuántos minutos quiere jugar (debe ser un múltiplo de la unidad base de
    // la cancha, ej. 60/120/180). Si se omite, se usa la unidad base — se
    // revalida siempre contra Cancha.duracionTurnoMin/duracionMaximaMin en el
    // servidor, nunca se confía en este valor sin chequear.
    duracionMin: z.number().int().positive().max(480).optional(),
    // Dividir pago, crear/unirse a partidos y recibir ofertas exigen cuenta —
    // por eso `dividir` solo es válido en la ruta autenticada (se re-valida
    // en el handler, esto es defensa en profundidad a nivel de esquema).
    dividir: z
      .object({
        participantes: z.number().int().min(2).max(12),
      })
      .optional(),
    // Solo cuando NO hay sesión: reservar como invitado, sin crear cuenta.
    invitado: z
      .object({
        nombre: z.string().trim().min(2).max(80),
        telefono: telefonoVeSchema,
        email: emailSchema.optional(),
      })
      .optional(),
  })
  .refine((v) => !(v.dividir && v.invitado), {
    message: 'Dividir el pago requiere una cuenta — no está disponible reservando como invitado.',
    path: ['dividir'],
  });
export type CrearReservaInput = z.infer<typeof crearReservaSchema>;

// ── Pago / comprobante ─────────────────────────────────────────────────────

export const enviarComprobanteSchema = z.object({
  reservaId: idSchema,
  cuotaId: idSchema.optional(),
  referencia: z.string().trim().min(3).max(40).optional(),
  // el archivo se sube aparte; acá va la key devuelta por el endpoint de upload
  comprobanteKey: z.string().min(3).max(200),
});
export type EnviarComprobanteInput = z.infer<typeof enviarComprobanteSchema>;

export const resolverPagoSchema = z.object({
  pagoId: idSchema,
  decision: z.enum(['APROBAR', 'RECHAZAR']),
  motivoRechazo: z.string().trim().max(280).optional(),
});
export type ResolverPagoInput = z.infer<typeof resolverPagoSchema>;

// ── Ofertas ────────────────────────────────────────────────────────────────

export const crearOfertaSchema = z
  .object({
    canchaId: idSchema,
    tipo: z.enum(['EXPRES', 'LAST_MINUTE']),
    inicioObjetivoISO: z.string().datetime(),
    finObjetivoISO: z.string().datetime(),
    descuentoPct: z.number().int().min(5).max(80),
    ventanaFinISO: z.string().datetime(),
    cupo: z.number().int().min(1).max(10).default(1),
    filtros: z
      .object({
        deportes: z.array(deporteSchema).optional(),
        zonas: z.array(z.string().max(60)).optional(),
        soloOptIn: z.boolean().default(true),
      })
      .optional(),
  })
  .refine((v) => v.finObjetivoISO > v.inicioObjetivoISO, {
    message: 'finObjetivo debe ser posterior a inicioObjetivo',
    path: ['finObjetivoISO'],
  });
export type CrearOfertaInput = z.infer<typeof crearOfertaSchema>;

// ── Matchmaking ────────────────────────────────────────────────────────────

export const crearPartidoSchema = z.object({
  canchaId: idSchema.optional(),
  deporte: deporteSchema,
  inicioISO: z.string().datetime(),
  finISO: z.string().datetime(),
  nivel: z.enum(['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO', 'COMPETITIVO']),
  cuposTotales: z.number().int().min(2).max(12),
  precioPorJugador: z.number().nonnegative().max(100000),
  notas: z.string().trim().max(280).optional(),
});
export type CrearPartidoInput = z.infer<typeof crearPartidoSchema>;

// ── Push ───────────────────────────────────────────────────────────────────

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(10).max(100),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

// ── Auth ───────────────────────────────────────────────────────────────────

export const registrarSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  email: emailSchema,
  telefono: telefonoVeSchema,
  password: z.string().min(10).max(256),
});
export type RegistrarInput = z.infer<typeof registrarSchema>;

// ── Configuración inicial: crear la Sede + su primer admin ──────────────────
// Solo corre una vez (ver /api/setup) — mientras no exista ninguna Sede con
// el slug de DEFAULT_SEDE_SLUG. Después de eso, todo lo demás (canchas,
// horarios, tarifas) se configura desde /panel/*, no hace falta el seed.

export const configurarClubSchema = z.object({
  sedeNombre: z.string().trim().min(2).max(120),
  pagoMovilBanco: z.string().trim().max(80).optional(),
  pagoMovilCedulaRif: z.string().trim().max(20).optional(),
  pagoMovilTelefono: telefonoVeSchema.optional(),
  adminNombre: z.string().trim().min(2).max(80),
  adminEmail: emailSchema,
  adminPassword: z.string().min(10).max(256),
});
export type ConfigurarClubInput = z.infer<typeof configurarClubSchema>;

export const entrarSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export type EntrarInput = z.infer<typeof entrarSchema>;

// ── 2FA (TOTP) ────────────────────────────────────────────────────────────

const codigo2FASchema = z.string().trim().min(4).max(11); // 6 dígitos o XXXX-XXXX de recuperación

export const confirmar2FASchema = z.object({ codigo: codigo2FASchema });
export type Confirmar2FAInput = z.infer<typeof confirmar2FASchema>;

export const verificar2FASchema = z.object({
  desafioId: z.string().uuid(),
  codigo: codigo2FASchema,
});
export type Verificar2FAInput = z.infer<typeof verificar2FASchema>;

export const desactivar2FASchema = z.object({
  password: z.string().min(1).max(256),
  codigo: codigo2FASchema,
});
export type Desactivar2FAInput = z.infer<typeof desactivar2FASchema>;

/**
 * Convierte a un invitado (ya creado al reservar sin cuenta) en cuenta real:
 * solo pide una contraseña (y el email, si no lo dio al reservar). Prueba de
 * identidad = el `accessToken` de SU reserva, no un email/password que no
 * tiene todavía.
 */
export const completarCuentaSchema = z.object({
  reservaId: idSchema,
  token: z.string().min(16).max(64),
  password: z.string().min(10).max(256),
  email: emailSchema.optional(),
});
export type CompletarCuentaInput = z.infer<typeof completarCuentaSchema>;

// ── Reserva: cancelación ─────────────────────────────────────────────────

export const cancelarReservaSchema = z.object({
  motivo: z.string().trim().max(280).optional(),
});
export type CancelarReservaInput = z.infer<typeof cancelarReservaSchema>;

// ── Split de pago (cuotas) ──────────────────────────────────────────────────

export const resolverCuotaSchema = z.object({
  decision: z.enum(['APROBAR', 'RECHAZAR']),
  motivoRechazo: z.string().trim().max(280).optional(),
});
export type ResolverCuotaInput = z.infer<typeof resolverCuotaSchema>;

// ── Split: el organizador cubre lo que falta ────────────────────────────────
// (una cuota entera, o un monto personalizado que reduce lo que debía un
// invitado y le asigna el resto al organizador). Solo mientras la cuota está
// PENDIENTE — ver /api/reservas/[id]/cuotas/[cuotaId]/cubrir.

export const cubrirCuotaSchema = z.object({
  monto: z.number().positive().max(1_000_000),
});
export type CubrirCuotaInput = z.infer<typeof cubrirCuotaSchema>;

// ── Matchmaking: unirse a un partido ────────────────────────────────────────

export const unirsePartidoSchema = z.object({}).strict();
export type UnirsePartidoInput = z.infer<typeof unirsePartidoSchema>;

/**
 * El organizador, cuando el partido ya se llenó, decide cómo se paga: entre
 * todos (split — cada quien su cuota, como cualquier reserva dividida) o él
 * solo (abono o pago completo según la política de pago parcial de la
 * sede, como cualquier reserva normal sin split).
 */
export const confirmarPartidoSchema = z.object({ dividir: z.boolean().default(false) });
export type ConfirmarPartidoInput = z.infer<typeof confirmarPartidoSchema>;

export const listarPartidosSchema = z.object({
  deporte: deporteSchema.optional(),
  nivel: z.enum(['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO', 'COMPETITIVO']).optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type ListarPartidosInput = z.infer<typeof listarPartidosSchema>;

// ── Tasa de cambio (BCV) — carga MANUAL, sin scraping/API ──────────────────

export const cargarTasaCambioSchema = z.object({
  moneda: z.enum(['USD', 'EUR']),
  tasaVES: z.number().positive().max(1_000_000),
  fechaISO: z.string().datetime().optional(), // default: hoy
});
export type CargarTasaCambioInput = z.infer<typeof cargarTasaCambioSchema>;

// ── Configuración de la sede: moneda de precios ─────────────────────────────

export const actualizarSedeSchema = z.object({
  precioMoneda: z.enum(['USD', 'EUR', 'VES']),
});
export type ActualizarSedeInput = z.infer<typeof actualizarSedeSchema>;

// ── Inventario: canchas y horarios ──────────────────────────────────────────

const duracionesSchema = z
  .object({
    duracionTurnoMin: z.number().int().min(15).max(240).default(60),
    duracionMaximaMin: z.number().int().min(15).max(480).default(180),
  })
  .refine((v) => v.duracionMaximaMin >= v.duracionTurnoMin, {
    message: 'La duración máxima no puede ser menor que la unidad base.',
    path: ['duracionMaximaMin'],
  })
  .refine((v) => v.duracionMaximaMin % v.duracionTurnoMin === 0, {
    message: 'La duración máxima debe ser múltiplo de la unidad base.',
    path: ['duracionMaximaMin'],
  });

export const crearCanchaSchema = z
  .object({
    nombre: z.string().trim().min(2).max(60),
    deporte: deporteSchema,
    superficie: superficieSchema,
    techada: z.boolean().default(false),
    capacidad: z.number().int().min(1).max(60).default(4),
    // Cuántas canchas físicas idénticas agrupa esta fila (pool por
    // disciplina) — 1 = una cancha real de toda la vida, ver Cancha.cantidad.
    cantidad: z.number().int().min(1).max(50).default(1),
  })
  .and(duracionesSchema);
export type CrearCanchaInput = z.infer<typeof crearCanchaSchema>;

export const actualizarCanchaSchema = z
  .object({
    nombre: z.string().trim().min(2).max(60).optional(),
    deporte: deporteSchema.optional(),
    superficie: superficieSchema.optional(),
    techada: z.boolean().optional(),
    capacidad: z.number().int().min(1).max(60).optional(),
    cantidad: z.number().int().min(1).max(50).optional(),
    duracionTurnoMin: z.number().int().min(15).max(240).optional(),
    duracionMaximaMin: z.number().int().min(15).max(480).optional(),
    activa: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para actualizar.' });
export type ActualizarCanchaInput = z.infer<typeof actualizarCanchaSchema>;

/** Una franja recurrente por día de semana (0 = domingo … 6 = sábado). */
export const horarioDiaSchema = z
  .object({
    diaSemana: z.number().int().min(0).max(6),
    activa: z.boolean(),
    horaInicio: z.number().int().min(0).max(1439),
    horaFin: z.number().int().min(1).max(1440),
    precioBase: z.number().nonnegative().max(1_000_000),
  })
  .refine((v) => v.horaFin > v.horaInicio, {
    message: 'La hora de cierre debe ser después de la de apertura.',
    path: ['horaFin'],
  });

/** Los 7 días de la semana, uno por índice — reemplaza toda la plantilla de la cancha. */
export const actualizarHorarioSchema = z.object({
  dias: z.array(horarioDiaSchema).length(7),
});
export type ActualizarHorarioInput = z.infer<typeof actualizarHorarioSchema>;

// ── Descuentos programados (EXPRES) — el admin decide cancha/horario/día/%,
//    nunca automático. Ver ReglaDescuento en el schema de Prisma. ─────────────

export const crearReglaDescuentoSchema = z
  .object({
    canchaId: z.string().min(1),
    // null/undefined = todos los días de la semana.
    diaSemana: z.number().int().min(0).max(6).nullable().optional(),
    horaInicio: z.number().int().min(0).max(1439),
    horaFin: z.number().int().min(1).max(1440),
    descuentoPct: z.number().int().min(1).max(90),
  })
  .refine((v) => v.horaFin > v.horaInicio, {
    message: 'La hora de cierre debe ser después de la de apertura.',
    path: ['horaFin'],
  });
export type CrearReglaDescuentoInput = z.infer<typeof crearReglaDescuentoSchema>;

export const actualizarReglaDescuentoSchema = z
  .object({
    activa: z.boolean().optional(),
    descuentoPct: z.number().int().min(1).max(90).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para actualizar.' });
export type ActualizarReglaDescuentoInput = z.infer<typeof actualizarReglaDescuentoSchema>;

// ── Pago parcial: cobrar el resto en sitio ──────────────────────────────────

export const cobrarRestanteSchema = z.object({
  metodo: z.enum(['EFECTIVO', 'PAGO_MOVIL', 'TARJETA']),
  referencia: z.string().trim().max(40).optional(),
});
export type CobrarRestanteInput = z.infer<typeof cobrarRestanteSchema>;

// ── Web Push: suscripción ────────────────────────────────────────────────────
// (pushSubscriptionSchema ya definido arriba)

// ── Panel del dueño: rango de fechas ────────────────────────────────────────

export const rangoFechasSchema = z.object({
  desdeISO: z.string().datetime().optional(),
  hastaISO: z.string().datetime().optional(),
});
export type RangoFechasInput = z.infer<typeof rangoFechasSchema>;

// ── Paginación (cursor) ────────────────────────────────────────────────────

export const paginacionSchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type PaginacionInput = z.infer<typeof paginacionSchema>;
