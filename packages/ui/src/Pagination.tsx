import type * as React from 'react';

export interface PaginationProps {
  /** Página actual (1-indexada). */
  page: number;
  /** Total de páginas. */
  totalPages: number;
  onChange: (page: number) => void;
  /** Cuántos números mostrar alrededor de la página actual. */
  siblings?: number;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);
}

/**
 * Paginación numérica. El proyecto usa paginación real (no scroll infinito)
 * en listados largos: reservas, clientes, partidos, cola de pagos.
 */
export function Pagination({ page, totalPages, onChange, siblings = 1 }: PaginationProps) {
  if (totalPages <= 1) return null;

  const left = Math.max(1, page - siblings);
  const right = Math.min(totalPages, page + siblings);
  const items: (number | 'gap')[] = [];

  if (left > 1) {
    items.push(1);
    if (left > 2) items.push('gap');
  }
  items.push(...range(left, right));
  if (right < totalPages) {
    if (right < totalPages - 1) items.push('gap');
    items.push(totalPages);
  }

  const cell: React.CSSProperties = {
    minWidth: 34,
    height: 34,
    padding: '0 8px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid var(--pl-line)',
    borderRadius: 'var(--pl-radius-sm)',
    background: 'var(--pl-bg-raised)',
    color: 'var(--pl-ink)',
    font: '600 13px/1 var(--pl-font-text)',
    cursor: 'pointer',
  };

  return (
    <nav aria-label="Paginación" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button
        type="button"
        style={{ ...cell, opacity: page === 1 ? 0.4 : 1 }}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="Página anterior"
      >
        ‹
      </button>

      {items.map((it, i) =>
        it === 'gap' ? (
          <span key={`gap-${i}`} style={{ ...cell, border: 'none', background: 'transparent', cursor: 'default' }}>
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            aria-current={it === page ? 'page' : undefined}
            onClick={() => onChange(it)}
            style={
              it === page
                ? { ...cell, background: 'var(--pl-ink)', color: 'var(--pl-bg-raised)', borderColor: 'var(--pl-ink)' }
                : cell
            }
          >
            {it}
          </button>
        ),
      )}

      <button
        type="button"
        style={{ ...cell, opacity: page === totalPages ? 0.4 : 1 }}
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Página siguiente"
      >
        ›
      </button>
    </nav>
  );
}
