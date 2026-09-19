import Link from 'next/link';
import type { PasoOnboarding } from '@/lib/onboarding';

/** Se muestra solo mientras falte al menos un paso — desaparece solo cuando el club ya está listo para recibir reservas. */
export function OnboardingChecklist({ pasos }: { pasos: PasoOnboarding[] }) {
  const faltan = pasos.filter((p) => !p.hecho);
  if (faltan.length === 0) return null;

  return (
    <div style={{ border: '1.5px solid var(--pl-line)', borderRadius: 'var(--pl-radius)', padding: 16, background: 'var(--pl-bg-raised)', marginBottom: 22 }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
        Primeros pasos
      </p>
      <h2 style={{ fontSize: 17, marginTop: 4 }}>
        Te falta{faltan.length === 1 ? '' : 'n'} {faltan.length} paso{faltan.length === 1 ? '' : 's'} para poder recibir reservas
      </h2>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {pasos.map((p) => (
          <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: p.hecho ? 'var(--pl-ink-soft)' : 'var(--pl-ink)', textDecoration: p.hecho ? 'line-through' : 'none' }}>
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  flex: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  background: p.hecho ? 'var(--pl-ok)' : 'var(--pl-bg-sunken)',
                  color: p.hecho ? '#fff' : 'var(--pl-ink-soft)',
                  border: p.hecho ? 'none' : '1.5px solid var(--pl-line)',
                }}
              >
                {p.hecho ? '✓' : ''}
              </span>
              {p.label}
            </span>
            {!p.hecho ? (
              <Link href={p.href} className="pl-btn pl-btn--ghost" style={{ padding: '4px 12px', fontSize: 12, flex: 'none', textDecoration: 'none' }}>
                {p.accion}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
