const BENEFICIOS = [
  {
    icono: (
      <path d="M12 3v6l4 2M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
    ),
    titulo: 'Ofertas de última hora',
    texto: 'Cuando alguien cancela cerca tuyo, te avisamos con descuento antes que a nadie.',
  },
  {
    icono: <path d="M4 7l8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4" />,
    titulo: 'Descuentos exprés',
    texto: 'Precios más bajos en las horas que se ven vacías — solo para cuentas.',
  },
  {
    icono: (
      <path d="M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 19c.6-3 3-4.7 5.5-4.7S13.4 16 14 19M15 18c.4-2 1.8-3 3.4-3s2.6.7 3.1 2.4" />
    ),
    titulo: 'Divide el pago',
    texto: 'Invita amigos por link y cada uno paga su parte — sin que ellos necesiten cuenta.',
  },
  {
    icono: <path d="M11 8v6M8 11h6M11 21a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
    titulo: 'Partidos abiertos',
    texto: '¿Te falta gente para jugar? Únete a partidos de tu nivel o crea el tuyo.',
  },
];

export interface BeneficiosCuentaProps {
  variant?: 'full' | 'compact';
  titulo?: string;
}

/**
 * Destaca las ventajas de tener cuenta — se muestra en cada punto donde
 * alguien está reservando o pagando como invitado (SlotPicker, comprobante,
 * link de split). Nunca bloquea el flujo; es una invitación, no un muro.
 */
export function BeneficiosCuenta({ variant = 'full', titulo = 'Con una cuenta gratis, además:' }: BeneficiosCuentaProps) {
  if (variant === 'compact') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--pl-bg-sunken)',
          border: '1.5px solid var(--pl-line)',
          borderRadius: 'var(--pl-radius)',
          padding: '10px 14px',
          fontSize: 13,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pl-clay)" strokeWidth="2" strokeLinecap="round" style={{ flex: 'none' }} aria-hidden>
          <path d="M12 3v6l4 2M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
        </svg>
        <span>
          Con una cuenta gratis recibes <strong>ofertas de última hora</strong>, puedes{' '}
          <strong>dividir pagos</strong> y unirte a <strong>partidos abiertos</strong>.
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--pl-ink)',
        color: 'var(--pl-bg)',
        borderRadius: 'var(--pl-radius-lg)',
        padding: 22,
      }}
    >
      <p style={{ fontFamily: 'var(--pl-font-display)', fontWeight: 800, fontSize: 17, marginBottom: 14 }}>{titulo}</p>
      <div style={{ display: 'grid', gap: 14 }}>
        {BENEFICIOS.map((b) => (
          <div key={b.titulo} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--pl-volt)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 1 }} aria-hidden>
              {b.icono}
            </svg>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>{b.titulo}</p>
              <p style={{ fontSize: 13, color: '#B6AC98', marginTop: 2 }}>{b.texto}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
