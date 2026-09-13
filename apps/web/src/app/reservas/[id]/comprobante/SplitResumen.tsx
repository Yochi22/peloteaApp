'use client';

import { useEffect, useState } from 'react';
import type * as React from 'react';
import { Alert } from '@pelotea/ui';

function leerCookie(nombre: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

function csrfHeaders(): Record<string, string> {
  return { 'Idempotency-Key': crypto.randomUUID(), 'x-csrf-token': leerCookie('pl_csrf') ?? '' };
}

function useCountdown(hastaISO: string | null) {
  const [restanteSec, setRestanteSec] = useState<number | null>(null);
  useEffect(() => {
    if (!hastaISO) return;
    const hasta = new Date(hastaISO).getTime();
    const tick = () => setRestanteSec(Math.max(0, Math.round((hasta - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hastaISO]);
  return restanteSec;
}

export interface CuotaResumen {
  id: string;
  monto: number;
  estado: string;
  esOrganizador: boolean;
  linkPago: string | null;
  nombreInvitado: string | null;
}

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Falta pagar',
  PAGADA: 'En revisión',
  APROBADA: 'Pagado',
  VENCIDA: 'Vencida',
};

function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          /* portapapeles no disponible; el enlace sigue visible para copiar a mano */
        }
      }}
      style={{
        border: '1.5px solid var(--pl-line)',
        borderRadius: 7,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 600,
        background: 'var(--pl-bg-raised)',
        cursor: 'pointer',
      }}
    >
      {copiado ? 'Copiado ✓' : 'Copiar enlace'}
    </button>
  );
}

/** Botón + monto para que el organizador cubra lo que un invitado no pagó. */
function CubrirBoton({
  reservaId,
  cuotaId,
  montoMaximo,
  onCubierto,
}: {
  reservaId: string;
  cuotaId: string;
  montoMaximo: number;
  onCubierto: (r: { cuotaCubiertaId: string; restante: number }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(montoMaximo);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        style={{ border: '1.5px solid var(--pl-clay)', color: 'var(--pl-clay-deep)', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 700, background: 'transparent', cursor: 'pointer' }}
      >
        Cubrir yo esta parte
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="number"
          min={0.01}
          max={montoMaximo}
          step="0.01"
          value={monto}
          onChange={(e) => setMonto(Number(e.target.value))}
          style={{ width: 90, border: '1.5px solid var(--pl-line)', borderRadius: 7, padding: '5px 8px', fontSize: 12 }}
        />
        <button
          type="button"
          disabled={enviando}
          onClick={async () => {
            setError(null);
            setEnviando(true);
            try {
              const res = await fetch(`/api/reservas/${reservaId}/cuotas/${cuotaId}/cubrir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
                body: JSON.stringify({ monto }),
              });
              const body = await res.json();
              if (!res.ok) {
                setError(body.error ?? 'No se pudo cubrir esta parte.');
                return;
              }
              onCubierto(body);
            } catch {
              setError('Problema de conexión.');
            } finally {
              setEnviando(false);
            }
          }}
          style={{ background: 'var(--pl-clay)', color: '#fff', border: 0, borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          {enviando ? '…' : 'Confirmar'}
        </button>
      </div>
      {error ? <span style={{ fontSize: 11, color: 'var(--pl-danger)' }}>{error}</span> : null}
    </div>
  );
}

/** Formulario de subida de UNA cuota que le corresponde pagar al organizador. */
function SubirComprobanteCuota({ cuotaId, onEnviado }: { cuotaId: string; onEnviado: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const archivo = form.get('archivo');
    if (!(archivo instanceof File) || archivo.size === 0) {
      setError('Selecciona la captura del pago.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuotas/${cuotaId}/comprobante`, { method: 'POST', headers: csrfHeaders(), body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'No se pudo enviar el comprobante.');
        return;
      }
      onEnviado();
    } catch {
      setError('Hubo un problema de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10, marginTop: 8, padding: 12, border: '1.5px dashed var(--pl-line)', borderRadius: 10 }}>
      <input type="file" name="archivo" accept="image/png,image/jpeg,image/webp,application/pdf" required style={{ fontSize: 12 }} />
      <input type="text" name="referencia" placeholder="Referencia (opcional)" maxLength={40} style={{ border: '1.5px solid var(--pl-line)', borderRadius: 8, padding: 8, font: 'inherit', fontSize: 12 }} />
      {error ? <Alert tone="danger" live>{error}</Alert> : null}
      <button className="pl-btn" type="submit" disabled={enviando} style={{ padding: '9px 14px', fontSize: 13 }}>
        {enviando ? 'Enviando…' : 'Enviar comprobante'}
      </button>
    </form>
  );
}

export function SplitResumen({
  reservaId,
  cuotaOrganizadorId,
  cuotas,
  holdExpiraEnISO,
  reservaEstadoInicial,
}: {
  reservaId: string;
  cuotaOrganizadorId: string;
  cuotas: CuotaResumen[];
  holdExpiraEnISO: string | null;
  reservaEstadoInicial: string;
}) {
  const [lista, setLista] = useState(cuotas);
  const [misCuotaIds, setMisCuotaIds] = useState<Set<string>>(new Set([cuotaOrganizadorId]));
  const [reservaEstado] = useState(reservaEstadoInicial);
  const restanteSec = useCountdown(reservaEstado === 'PENDIENTE_PAGO' ? holdExpiraEnISO : null);

  return (
    <div style={{ marginTop: 20 }}>
      {restanteSec !== null ? (
        <div style={{ marginBottom: 16 }}>
          <Alert
            tone={restanteSec < 120 ? 'danger' : 'warn'}
            title={`Se libera en ${Math.floor(restanteSec / 60)}:${String(restanteSec % 60).padStart(2, '0')} si nadie completa el pago`}
            live
          >
            Comparte los enlaces con tus amigos, o cubre tú la parte de quien no pague a tiempo.
          </Alert>
        </div>
      ) : null}

      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--pl-ink-soft)' }}>
        Split de pago
      </p>

      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {lista.map((c) => {
          const esMia = misCuotaIds.has(c.id);
          return (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: '1.5px solid var(--pl-line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <p style={{ fontWeight: 600 }}>
                    {esMia ? 'Tú' : c.nombreInvitado || 'Invitado sin registrarse'}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--pl-ink-soft)' }}>Bs {c.monto.toLocaleString('es-VE')}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 9px',
                      borderRadius: 20,
                      background: c.estado === 'APROBADA' ? 'var(--pl-ok-bg)' : c.estado === 'PAGADA' ? 'var(--pl-warn-bg)' : 'var(--pl-bg-sunken)',
                      color: c.estado === 'APROBADA' ? 'var(--pl-ok)' : c.estado === 'PAGADA' ? 'var(--pl-warn)' : 'var(--pl-ink-soft)',
                    }}
                  >
                    {ESTADO_LABEL[c.estado] ?? c.estado}
                  </span>
                  {!esMia && c.linkPago && c.estado === 'PENDIENTE' ? <CopiarLink url={c.linkPago} /> : null}
                  {!esMia && c.estado === 'PENDIENTE' ? (
                    <CubrirBoton
                      reservaId={reservaId}
                      cuotaId={c.id}
                      montoMaximo={c.monto}
                      onCubierto={(r) => {
                        if (r.restante > 0) {
                          // Cobertura parcial: baja lo que debía el invitado y aparece una cuota nueva (mía).
                          setLista((prev) => [
                            ...prev.map((x) => (x.id === c.id ? { ...x, monto: r.restante } : x)),
                            { id: r.cuotaCubiertaId, monto: c.monto - r.restante, estado: 'PENDIENTE', esOrganizador: false, linkPago: null, nombreInvitado: null },
                          ]);
                          setMisCuotaIds((prev) => new Set(prev).add(r.cuotaCubiertaId));
                        } else {
                          // Cobertura completa: esta misma cuota pasa a ser mía.
                          setLista((prev) => prev.map((x) => (x.id === c.id ? { ...x, nombreInvitado: null, linkPago: null } : x)));
                          setMisCuotaIds((prev) => new Set(prev).add(c.id));
                        }
                      }}
                    />
                  ) : null}
                </div>
              </div>

              {esMia && c.estado === 'PENDIENTE' ? (
                <SubirComprobanteCuota
                  cuotaId={c.id}
                  onEnviado={() => setLista((prev) => prev.map((x) => (x.id === c.id ? { ...x, estado: 'PAGADA' } : x)))}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {lista.some((c) => misCuotaIds.has(c.id) && c.estado !== 'PENDIENTE') ? (
        <div style={{ marginTop: 16 }}>
          <Alert tone="ok" title="Comprobante(s) enviado(s)" live>
            El club los revisa antes de confirmar. En cuanto todos paguen, la cancha queda confirmada.
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
