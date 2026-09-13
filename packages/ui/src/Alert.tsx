import type { ReactNode } from 'react';

export type AlertTone = 'info' | 'ok' | 'warn' | 'danger';

const TONE: Record<AlertTone, { bg: string; fg: string; bd: string }> = {
  info: { bg: 'var(--pl-info-bg)', fg: 'var(--pl-info)', bd: 'var(--pl-info)' },
  ok: { bg: 'var(--pl-ok-bg)', fg: 'var(--pl-ok)', bd: 'var(--pl-ok)' },
  warn: { bg: 'var(--pl-warn-bg)', fg: 'var(--pl-warn)', bd: 'var(--pl-warn)' },
  danger: { bg: 'var(--pl-danger-bg)', fg: 'var(--pl-danger)', bd: 'var(--pl-danger)' },
};

const ICON: Record<AlertTone, ReactNode> = {
  info: <path d="M12 8h.01M11 12h1v4h1" />,
  ok: <path d="m8 12 3 3 5-6" />,
  warn: <path d="M12 8v5M12 16h.01" />,
  danger: <path d="M12 8v5M12 16h.01" />,
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Acción a la derecha (link o botón). */
  action?: ReactNode;
  /** Rol ARIA: 'status' para info/ok, 'alert' para warn/danger. */
  live?: boolean;
}

/**
 * Alerta / banner de estado. Componente de primera clase — se usa para
 * hold por vencer, comprobante recibido, oferta tomada, aprobación/rechazo.
 */
export function Alert({ tone = 'info', title, children, action, live }: AlertProps) {
  const t = TONE[tone];
  const role = live ? (tone === 'danger' || tone === 'warn' ? 'alert' : 'status') : undefined;
  return (
    <div
      role={role}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        background: t.bg,
        border: `1.5px solid color-mix(in oklch, ${t.bd} 45%, transparent)`,
        borderRadius: 'var(--pl-radius)',
        padding: '12px 14px',
        color: 'var(--pl-ink)',
        font: '14px/1.5 var(--pl-font-text)',
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={t.fg}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flex: 'none', marginTop: 1 }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        {ICON[tone]}
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? <strong style={{ display: 'block', marginBottom: children ? 2 : 0 }}>{title}</strong> : null}
        {children}
      </div>
      {action ? <div style={{ flex: 'none' }}>{action}</div> : null}
    </div>
  );
}
