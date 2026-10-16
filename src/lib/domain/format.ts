import type { CurrencyTag } from '@/types/contracts';

/**
 * Formatea un monto numérico con formato venezolano:
 * - Separador de miles: punto (.)
 * - Separador decimal: coma (,)
 * - Siempre 2 decimales
 * - Sufijo " Bs" con espacio ASCII estándar
 *
 * Ejemplo: 1234.56 -> "1.234,56 Bs"
 */
export function formatBs(amount: number): string {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const fixed = abs.toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  const withThousands = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}${withThousands},${decimalPart} Bs`;
}

/**
 * Formatea un monto con su etiqueta de moneda (VES -> "Bs", USD -> "USD").
 *
 * Ejemplo: formatLineAmount(1234.56, 'USD') -> "1.234,56 USD"
 * Ejemplo: formatLineAmount(1234.56, 'VES') -> "1.234,56 Bs"
 */
export function formatLineAmount(amount: number, currencyTag: CurrencyTag): string {
  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const fixed = abs.toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  const withThousands = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const symbol = currencyTag === 'USD' ? 'USD' : 'Bs';
  return `${isNegative ? '-' : ''}${withThousands},${decimalPart} ${symbol}`;
}

/**
 * Formatea un margen numérico a representación porcentual.
 * Usa coma como separador decimal si tiene decimales.
 *
 * Ejemplo: 20 -> "20%"
 * Ejemplo: 12.5 -> "12,5%"
 * Ejemplo: 0 -> "0%"
 */
export function formatMarginPercent(margin: number): string {
  const str = margin.toString().replace('.', ',');
  return `${str}%`;
}

/**
 * Parsea un string numérico localizado que puede contener punto o coma decimal
 * y posibles separadores de miles.
 *
 * Retorna el número válido o null si la entrada no es un número válido.
 */
export function parseLocalizedDecimal(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  if (trimmed.includes('.') && trimmed.includes(',')) {
    const lastDot = trimmed.lastIndexOf('.');
    const lastComma = trimmed.lastIndexOf(',');
    if (lastComma > lastDot) {
      // Formato venezolano: 1.234,56 -> quitar puntos, cambiar coma por punto
      const clean = trimmed.replace(/\./g, '').replace(',', '.');
      const num = Number(clean);
      return Number.isFinite(num) ? num : null;
    } else {
      // Formato anglosajón: 1,234.56 -> quitar comas
      const clean = trimmed.replace(/,/g, '');
      const num = Number(clean);
      return Number.isFinite(num) ? num : null;
    }
  }

  if (trimmed.includes(',')) {
    const clean = trimmed.replace(',', '.');
    const num = Number(clean);
    return Number.isFinite(num) ? num : null;
  }

  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

/**
 * Formatea una fecha a "DD/MM/YYYY" en la zona horaria America/Caracas (UTC-4).
 * Si la entrada es un string puro "YYYY-MM-DD", lo formatea directamente sin desfase horario.
 */
export function formatCaracasDate(dateInput: Date | string): string {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-');
    return `${day}/${month}/${year}`;
  }

  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const parts = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  return `${day}/${month}/${year}`;
}

/**
 * Obtiene la fecha actual en formato ISO "YYYY-MM-DD" en la zona horaria America/Caracas.
 */
export function getCaracasTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Genera el nombre por defecto para una nueva lista de compras:
 * "Compra del DD/MM/YYYY" en zona horaria America/Caracas.
 */
export function getDefaultShoppingListName(now: Date = new Date()): string {
  const formattedDate = formatCaracasDate(now);
  return `Compra del ${formattedDate}`;
}
