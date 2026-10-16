import 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';
import type {
  NormalizedCatalogProductInput,
  DistributorPdfParseResult,
  DistributorPdfParseSuccess,
  DistributorPdfParseFailure,
} from '@/types/contracts';

// =============================================================================
// Constantes y marcadores oficiales de Distribuidora y Comercializadora FC
// Preservados exactamente de parse-distributor-pdf.mjs:3-9
// =============================================================================
export const COMPANY_MARKER = 'DISTRIBUIDORA Y COMERCIALIZADORA FC';
export const TITLE_MARKER = 'LISTA DE PRECIOS ACTUALIZADA';
export const RATE_MARKER = 'TASA DEL DIA (BCV):';
export const DATE_MARKER = 'FECHA:';

export const PRODUCT_ROW_PATTERN = /^Bs\s+([0-9][0-9 ]*\.[0-9]{2})\s+(.+)$/;

// Regex para remover sufijos de empaque identificables con seguridad (Sección 8: L334)
const PACKAGING_SUFFIX_REGEX =
  /(?:[-–—,/|\s]+|\s*\()(?:caja|bulto|paquete|display|fardo)?\s*x\s*\d+\s*(?:und|unid|unidades|uds|piezas|sobres|latas|botellas)?(?:\s*[-–—,/|\s]*|\))?$/i;

// =============================================================================
// Funciones de utilidad y extracción
// =============================================================================

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function parseRateFromLine(line: string): string | null {
  const markerIndex = line.indexOf(RATE_MARKER);

  if (markerIndex === -1) {
    return null;
  }

  const afterMarker = line.slice(markerIndex + RATE_MARKER.length);
  const match = afterMarker.match(/^\s*([0-9][0-9 ]*\.[0-9]{2})Bs\s*$/);

  if (!match) {
    return null;
  }

  return match[1].replace(/ /g, '');
}

export function parseDateFromLine(line: string): string | null {
  const match = line.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4})\s*FECHA:/);

  if (!match) {
    return null;
  }

  const [day, month, year] = match[1].split('/');

  return `${year}-${month}-${day}`;
}

/**
 * Valida que una terna (año, mes, día) exista realmente en el calendario gregoriano.
 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Calcula la fecha máxima permitida (hoy + 1 día en zona horaria America/Caracas).
 */
export function getMaxAllowedDateIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parseInt(parts.find((p) => p.type === 'year')!.value, 10);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value, 10);
  const day = parseInt(parts.find((p) => p.type === 'day')!.value, 10);

  const tomorrowUtc = new Date(Date.UTC(year, month - 1, day + 1));
  const tYear = tomorrowUtc.getUTCFullYear();
  const tMonth = String(tomorrowUtc.getUTCMonth() + 1).padStart(2, '0');
  const tDay = String(tomorrowUtc.getUTCDate()).padStart(2, '0');

  return `${tYear}-${tMonth}-${tDay}`;
}

/**
 * Normaliza el nombre de origen del producto (sourceName):
 * - Minúsculas
 * - Sin tildes / diacríticos
 * - Espacios simples colapsados
 */
export function normalizeSourceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convierte un texto a Title Case conservando tildes y mayúsculas iniciales.
 */
export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Remueve sufijos de empaque identificables con seguridad (Sección 8: L334).
 */
export function stripPackagingSuffix(value: string): string {
  const stripped = value.replace(PACKAGING_SUFFIX_REGEX, '').trim();
  return stripped.length > 0 ? stripped : value.trim();
}

/**
 * Genera el displayName:
 * Quita empaque identificado con seguridad y pasa a Title Case conservando tildes (Sección 8: L334-L335).
 */
export function formatDisplayName(value: string): string {
  const clean = stripPackagingSuffix(normalizeWhitespace(value));
  return toTitleCase(clean);
}

// =============================================================================
// Opciones de parseo para la aplicación web
// =============================================================================

export interface ParseDistributorOptions {
  now?: Date;
  duplicatePriceStrategy?: 'last_wins' | 'error';
}

// =============================================================================
// Adaptación para la aplicación web (cumple CONT-03)
// =============================================================================

/**
 * Parsea el texto extraído de un PDF de Distribuidora FC aplicando las reglas
 * de negocio de la Sección 8 y retornando el resultado normalizado según CONT-03.
 */
export function parseDistributorTextForApp(
  text: string,
  options?: ParseDistributorOptions
): DistributorPdfParseResult {
  if (typeof text !== 'string') {
    return {
      ok: false,
      reason: 'NO_PRODUCTS',
      userMessage: 'No se pudieron extraer productos del PDF.',
      technicalDetail: 'Distributor text must be provided as a string.',
    };
  }

  if (!text.includes(COMPANY_MARKER)) {
    return {
      ok: false,
      reason: 'NO_PRODUCTS',
      userMessage: 'No se pudieron extraer productos del PDF.',
      technicalDetail: 'This does not appear to be a Distribuidora FC price list (missing COMPANY_MARKER).',
    };
  }

  if (!text.includes(TITLE_MARKER)) {
    return {
      ok: false,
      reason: 'NO_PRODUCTS',
      userMessage: 'No se pudieron extraer productos del PDF.',
      technicalDetail: 'The price-list title could not be found (missing TITLE_MARKER).',
    };
  }

  const lines = text.split(/\r?\n/);
  const rates: string[] = [];
  const dates: string[] = [];

  for (const line of lines) {
    const rate = parseRateFromLine(line);
    if (rate !== null) {
      rates.push(rate);
    }

    const date = parseDateFromLine(line);
    if (date !== null) {
      dates.push(date);
    }
  }

  // 1. Validación de Tasa BCV (Sección 18: L851)
  if (rates.length === 0) {
    return {
      ok: false,
      reason: 'MISSING_RATE',
      userMessage: 'No se encontró la tasa BCV en el PDF.',
      technicalDetail: 'The BCV rate could not be found in the PDF.',
    };
  }

  if (new Set(rates).size !== 1) {
    return {
      ok: false,
      reason: 'MISSING_RATE',
      userMessage: 'No se encontró la tasa BCV en el PDF.',
      technicalDetail: 'The PDF contains conflicting BCV rates.',
    };
  }

  const numericRate = Number(rates[0]);
  if (!Number.isFinite(numericRate) || numericRate <= 0) {
    return {
      ok: false,
      reason: 'MISSING_RATE',
      userMessage: 'No se encontró la tasa BCV en el PDF.',
      technicalDetail: `The BCV rate must be greater than zero (found: ${rates[0]}).`,
    };
  }

  // 2. Validación de Fecha (Sección 18: L850)
  if (dates.length === 0) {
    return {
      ok: false,
      reason: 'MISSING_DATE',
      userMessage: 'No se encontró la fecha de la lista de precios en el PDF.',
      technicalDetail: 'The PDF date could not be found.',
    };
  }

  if (new Set(dates).size !== 1) {
    return {
      ok: false,
      reason: 'MISSING_DATE',
      userMessage: 'No se encontró la fecha de la lista de precios en el PDF.',
      technicalDetail: 'The PDF contains conflicting dates.',
    };
  }

  const dateStr = dates[0];
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (!isValidCalendarDate(year, month, day)) {
    return {
      ok: false,
      reason: 'MISSING_DATE',
      userMessage: 'No se encontró la fecha de la lista de precios en el PDF.',
      technicalDetail: `The extracted date (${dateStr}) does not exist in the calendar.`,
    };
  }

  const maxAllowedDate = getMaxAllowedDateIso(options?.now);
  if (dateStr > maxAllowedDate) {
    return {
      ok: false,
      reason: 'MISSING_DATE',
      userMessage: 'No se encontró la fecha de la lista de precios en el PDF.',
      technicalDetail: `The extracted date (${dateStr}) is more than 1 day in the future in America/Caracas (max allowed: ${maxAllowedDate}).`,
    };
  }

  // 3. Extracción y normalización de productos (Sección 8: L331-L341)
  const duplicateStrategy = options?.duplicatePriceStrategy ?? 'last_wins';
  const productsBySource = new Map<string, NormalizedCatalogProductInput>();
  const orderedProducts: NormalizedCatalogProductInput[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(PRODUCT_ROW_PATTERN);

    if (!match) {
      continue;
    }

    const price = Number(match[1].replace(/ /g, ''));
    const pdfName = normalizeWhitespace(match[2]);

    if (pdfName.length === 0 || !Number.isFinite(price) || price <= 0) {
      return {
        ok: false,
        reason: 'NO_PRODUCTS',
        userMessage: 'No se pudieron extraer productos del PDF.',
        technicalDetail: `Malformed product row on line ${index + 1}: invalid price or empty name.`,
      };
    }

    const sourceName = normalizeSourceName(pdfName);
    const displayName = formatDisplayName(pdfName);

    const existing = productsBySource.get(sourceName);

    if (existing) {
      if (existing.boxPriceBs !== price) {
        if (duplicateStrategy === 'error') {
          return {
            ok: false,
            reason: 'NO_PRODUCTS',
            userMessage: 'No se pudieron extraer productos del PDF.',
            technicalDetail: `Conflicting duplicate product name: "${pdfName}". First price: ${existing.boxPriceBs}. Later price: ${price}.`,
          };
        }

        // CONF-01 / last_wins: gana la última aparición válida
        existing.boxPriceBs = price;
        existing.pdfName = pdfName;
        existing.displayName = displayName;
      }
      continue;
    }

    const product: NormalizedCatalogProductInput = {
      pdfName,
      sourceName,
      displayName,
      boxPriceBs: price,
    };

    productsBySource.set(sourceName, product);
    orderedProducts.push(product);
  }

  if (orderedProducts.length === 0) {
    return {
      ok: false,
      reason: 'NO_PRODUCTS',
      userMessage: 'No se pudieron extraer productos del PDF.',
      technicalDetail: 'No products were found in the PDF.',
    };
  }

  return {
    ok: true,
    priceListDate: dateStr,
    bcvRate: numericRate,
    products: orderedProducts,
    pages: null,
  };
}

/**
 * Parsea un buffer PDF en Uint8Array usando pdf-parse (v2) y retorna el resultado
 * adaptado según el contrato CONT-03.
 * Garantiza que parser.destroy() siempre se ejecute en el bloque finally.
 */
export async function parseDistributorPdfForApp(
  pdfBytes: Uint8Array,
  options?: ParseDistributorOptions
): Promise<DistributorPdfParseResult> {
  if (!(pdfBytes instanceof Uint8Array) || pdfBytes.length === 0) {
    return {
      ok: false,
      reason: 'NO_PRODUCTS',
      userMessage: 'No se pudieron extraer productos del PDF.',
      technicalDetail: 'PDF bytes must be provided as a non-empty Uint8Array.',
    };
  }

  let parser: PDFParse | null = null;
  let text = '';
  let pages: number | null = null;

  try {
    parser = new PDFParse({ data: pdfBytes });
    const result = await parser.getText();
    text = result.text ?? '';
    pages = result.total ?? null;
  } catch (error) {
    return {
      ok: false,
      reason: 'NO_PRODUCTS',
      userMessage: 'No se pudieron extraer productos del PDF.',
      technicalDetail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }

  const parseResult = parseDistributorTextForApp(text, options);

  if (parseResult.ok) {
    return {
      ...parseResult,
      pages,
    };
  }

  return parseResult;
}

// =============================================================================
// API Original de referencia (conservada idéntica de parse-distributor-pdf.mjs)
// =============================================================================

export async function extractDistributorPdfText(pdfBytes: Uint8Array): Promise<string> {
  if (!(pdfBytes instanceof Uint8Array)) {
    throw new TypeError('PDF bytes must be provided as a Uint8Array.');
  }

  const parser = new PDFParse({ data: pdfBytes });
  let result: { text?: string };

  try {
    result = await parser.getText();
  } finally {
    await parser.destroy();
  }

  return result.text ?? '';
}

export function parseDistributorText(text: string) {
  if (typeof text !== 'string') {
    throw new TypeError('Distributor text must be provided as a string.');
  }

  const lines = text.split(/\r?\n/);

  if (!text.includes(COMPANY_MARKER)) {
    throw new Error('This does not appear to be a Distribuidora FC price list.');
  }

  if (!text.includes(TITLE_MARKER)) {
    throw new Error('The price-list title could not be found.');
  }

  const rates: string[] = [];
  const dates: string[] = [];

  for (const line of lines) {
    const rate = parseRateFromLine(line);
    if (rate !== null) rates.push(rate);

    const date = parseDateFromLine(line);
    if (date !== null) dates.push(date);
  }

  if (rates.length === 0) {
    throw new Error("The BCV rate could not be found in the PDF. Is this the distributor's correct file?");
  }

  if (new Set(rates).size !== 1) {
    throw new Error('The PDF contains conflicting BCV rates. Upload was cancelled.');
  }

  if (dates.length === 0) {
    throw new Error("The PDF's date could not be found.");
  }

  if (new Set(dates).size !== 1) {
    throw new Error('The PDF contains conflicting dates. Upload was cancelled.');
  }

  const products: { pdfName: string; price: string }[] = [];
  const productsByName = new Map<string, { pdfName: string; price: string }>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(PRODUCT_ROW_PATTERN);

    if (!match) continue;

    const price = match[1].replace(/ /g, '');
    const pdfName = normalizeWhitespace(match[2]);

    if (pdfName.length === 0) {
      throw new Error(`Malformed product row on extracted line ${index + 1}: product name is empty.`);
    }

    const existing = productsByName.get(pdfName);

    if (existing) {
      if (existing.price !== price) {
        throw new Error(
          `Conflicting duplicate product name: "${pdfName}". First price: ${existing.price}. Later price: ${price}.`
        );
      }
      continue;
    }

    const product = { pdfName, price };
    products.push(product);
    productsByName.set(pdfName, product);
  }

  if (products.length === 0) {
    throw new Error('No products were found in the PDF.');
  }

  return {
    pdfDate: dates[0],
    bcvRate: rates[0],
    products,
    extraction: {
      productCount: products.length,
    },
  };
}

export async function parseDistributorPdf(pdfBytes: Uint8Array) {
  if (!(pdfBytes instanceof Uint8Array)) {
    throw new TypeError('PDF bytes must be provided as a Uint8Array.');
  }

  const parser = new PDFParse({ data: pdfBytes });
  let result: { text?: string; total?: number };

  try {
    result = await parser.getText();
  } finally {
    await parser.destroy();
  }

  const text = result.text ?? '';
  const parsed = parseDistributorText(text);

  return {
    ...parsed,
    extraction: {
      ...parsed.extraction,
      pages: result.total ?? null,
    },
  };
}
