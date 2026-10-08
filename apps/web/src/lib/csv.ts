/**
 * CSV mínimo (RFC 4180): escapa comillas, comas y saltos de línea. Nada de
 * librerías — es una sola función y el formato es simple.
 */
function celda(valor: string | number | boolean | null | undefined): string {
  const s = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function aCsv(filas: Array<Array<string | number | boolean | null | undefined>>): string {
  // BOM al inicio: sin esto, Excel en Windows (todavía el caso más común
  // entre dueños de clubes) interpreta los acentos del español como
  // caracteres sueltos en vez de UTF-8.
  return '﻿' + filas.map((fila) => fila.map(celda).join(',')).join('\r\n');
}
