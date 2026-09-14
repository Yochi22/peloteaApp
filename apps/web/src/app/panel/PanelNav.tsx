'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type * as React from 'react';

interface ItemNav {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const ITEMS: ItemNav[] = [
  {
    href: '/panel',
    label: 'Inicio',
    icon: (
      <Icon>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </Icon>
    ),
  },
  {
    href: '/panel/agenda',
    label: 'Agenda del día',
    icon: (
      <Icon>
        <rect x="3" y="4.5" width="18" height="16" rx="2" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </Icon>
    ),
  },
  {
    href: '/panel/reservas',
    label: 'Reservas',
    icon: (
      <Icon>
        <path d="M4 6h16v14H4z" />
        <path d="M4 10h16M9 3v5" />
      </Icon>
    ),
  },
  {
    href: '/panel/canchas',
    label: 'Canchas',
    icon: (
      <Icon>
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="M12 5v14M3 12h18" />
      </Icon>
    ),
  },
  {
    href: '/panel/finanzas',
    label: 'Finanzas',
    icon: (
      <Icon>
        <path d="M3 20V10M9 20V4M15 20v-7M21 20V8" />
      </Icon>
    ),
  },
  {
    href: '/panel/descuentos',
    label: 'Descuentos',
    icon: (
      <Icon>
        <path d="M20 12 12 20 4 12l4-8h8z" />
        <circle cx="12" cy="12" r="2" />
      </Icon>
    ),
  },
  {
    href: '/panel/tasa-cambio',
    label: 'Tasa de cambio',
    icon: (
      <Icon>
        <path d="M7 8h10M7 8l3-3M7 8l3 3M17 16H7M17 16l-3-3M17 16l-3 3" />
      </Icon>
    ),
  },
  {
    href: '/panel/whatsapp',
    label: 'WhatsApp',
    icon: (
      <Icon>
        <path d="M12 3a9 9 0 0 0-7.6 13.8L3 21l4.4-1.4A9 9 0 1 0 12 3Z" />
        <path d="M8.5 8.7c0 4 3 6.8 6.8 6.8.6 0 .9-.6.6-1.1l-1-1.7c-.2-.4-.7-.5-1.1-.3l-.8.4a5 5 0 0 1-2.8-2.8l.4-.8c.2-.4.1-.9-.3-1.1l-1.7-1c-.5-.3-1.1 0-1.1.6Z" />
      </Icon>
    ),
  },
  {
    href: '/panel/configuracion',
    label: 'Configuración',
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </Icon>
    ),
  },
];

export function PanelNav() {
  const pathname = usePathname();
  return (
    <nav className="pl-panel-nav" aria-label="Panel">
      {ITEMS.map((item) => {
        // /panel activo solo en la propia raíz, no como prefijo de todas
        // las demás rutas (todas empiezan con "/panel").
        const activo = item.href === '/panel' ? pathname === '/panel' : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={activo ? 'pl-panel-navlink pl-panel-navlink--active' : 'pl-panel-navlink'}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
