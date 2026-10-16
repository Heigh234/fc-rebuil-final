import { describe, it, expect } from 'vitest';
import {
  parseDistributorTextForApp,
  parseDistributorPdfForApp,
  parseDistributorText,
  normalizeSourceName,
  formatDisplayName,
  stripPackagingSuffix,
  isValidCalendarDate,
  getMaxAllowedDateIso,
  COMPANY_MARKER,
  TITLE_MARKER,
} from '@/lib/pdf/distributor-parser';

// Generador sintético de PDF mínimo válido en memoria para pruebas binarias
function createMinimalPdf(lines: string[]): Uint8Array {
  const content = lines
    .map((line, idx) => `BT /F1 12 Tf 50 ${750 - idx * 20} Td (${line.replace(/\(/g, '\\(').replace(/\)/g, '\\)')}) Tj ET`)
    .join('\n');

  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${content.length} >> stream
${content}
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000293 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
${350 + content.length}
%%EOF`;

  return new TextEncoder().encode(pdf);
}

describe('distributor-parser.ts - Parser Oficial adaptado (MOD-04)', () => {
  const fixedNow = new Date('2026-10-16T15:00:00Z');

  const validTextSample = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
16/10/2026 FECHA:
Bs 1 234.50 HARINA PAN 1KG X 20 UND
Bs 560.00 ACEITE DIANA 1L (CAJA X 12)
Bs 45.00 ARROZ MARY ESMERALDA 1KG
`;

  describe('Funciones auxiliares y normalización', () => {
    it('normaliza sourceName a minúsculas, sin tildes y con espacios simples', () => {
      expect(normalizeSourceName('  HARINA DE MAÍZ   BLANCO  ')).toBe('harina de maiz blanco');
      expect(normalizeSourceName('CAFÉ PURÍSIMO EN GRANO')).toBe('cafe purisimo en grano');
      expect(normalizeSourceName('ATÚN EN ACEITE')).toBe('atun en aceite');
    });

    it('remueve sufijos de empaque identificables con seguridad en displayName', () => {
      expect(stripPackagingSuffix('HARINA PAN 1KG X 20 UND')).toBe('HARINA PAN 1KG');
      expect(stripPackagingSuffix('ACEITE DIANA 1L (CAJA X 12)')).toBe('ACEITE DIANA 1L');
      expect(stripPackagingSuffix('GALLETAS CLUB SOCIAL X 24')).toBe('GALLETAS CLUB SOCIAL');
      expect(stripPackagingSuffix('ATUN MARGARITA 140G - X 48')).toBe('ATUN MARGARITA 140G');
      expect(stripPackagingSuffix('ARROZ MARY ESMERALDA 1KG')).toBe('ARROZ MARY ESMERALDA 1KG');
    });

    it('formatea displayName a Title Case conservando tildes y removiendo empaque', () => {
      expect(formatDisplayName('HARINA DE MAÍZ BLANCO X 20 UND')).toBe('Harina De Maíz Blanco');
      expect(formatDisplayName('CAFÉ PURÍSIMO (CAJA X 12)')).toBe('Café Purísimo');
    });

    it('valida fechas reales del calendario gregoriano', () => {
      expect(isValidCalendarDate(2026, 10, 16)).toBe(true);
      expect(isValidCalendarDate(2024, 2, 29)).toBe(true); // Bisiesto
      expect(isValidCalendarDate(2025, 2, 29)).toBe(false); // No bisiesto
      expect(isValidCalendarDate(2026, 2, 31)).toBe(false); // 31 de febrero no existe
      expect(isValidCalendarDate(2026, 4, 31)).toBe(false); // 31 de abril no existe
    });

    it('calcula la fecha máxima permitida como hoy + 1 día en Caracas', () => {
      expect(getMaxAllowedDateIso(fixedNow)).toBe('2026-10-17');
    });
  });

  describe('parseDistributorTextForApp - Casos exitosos', () => {
    it('extrae fecha, tasa y productos con normalización correcta', () => {
      const result = parseDistributorTextForApp(validTextSample, { now: fixedNow });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.priceListDate).toBe('2026-10-16');
        expect(result.bcvRate).toBe(36.5);
        expect(result.products).toHaveLength(3);

        const [p1, p2, p3] = result.products;
        expect(p1.pdfName).toBe('HARINA PAN 1KG X 20 UND');
        expect(p1.sourceName).toBe('harina pan 1kg x 20 und');
        expect(p1.displayName).toBe('Harina Pan 1kg');
        expect(p1.boxPriceBs).toBe(1234.5);

        expect(p2.pdfName).toBe('ACEITE DIANA 1L (CAJA X 12)');
        expect(p2.sourceName).toBe('aceite diana 1l (caja x 12)');
        expect(p2.displayName).toBe('Aceite Diana 1l');
        expect(p2.boxPriceBs).toBe(560.0);

        expect(p3.displayName).toBe('Arroz Mary Esmeralda 1kg');
        expect(p3.boxPriceBs).toBe(45.0);
      }
    });

    it('soporta tasas con separador de miles con espacios (ej. 1 050.25Bs)', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 1 050.25Bs
16/10/2026 FECHA:
Bs 100.00 PRODUCTO TEST
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bcvRate).toBe(1050.25);
      }
    });

    it('acepta una fecha exactamente 1 día en el futuro respecto a Caracas (hoy + 1)', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
17/10/2026 FECHA:
Bs 100.00 PRODUCTO TEST
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.priceListDate).toBe('2026-10-17');
      }
    });

    it('deduplica silenciosamente productos con el mismo precio', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.products).toHaveLength(1);
        expect(result.products[0].boxPriceBs).toBe(50.0);
      }
    });

    it('resuelve duplicados con precios distintos mediante last_wins por defecto (CONF-01)', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
Bs 65.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.products).toHaveLength(1);
        expect(result.products[0].boxPriceBs).toBe(65.0); // Gana la última aparición
      }
    });
  });

  describe('parseDistributorTextForApp - Casos de fallo y mensajes exactos de la Sección 18', () => {
    it('falla con NO_PRODUCTS si falta COMPANY_MARKER', () => {
      const text = `
OTRA EMPRESA C.A.
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NO_PRODUCTS');
        expect(result.userMessage).toBe('No se pudieron extraer productos del PDF.');
      }
    });

    it('falla con NO_PRODUCTS si falta TITLE_MARKER', () => {
      const text = `
${COMPANY_MARKER}
OTRO TITULO
TASA DEL DIA (BCV): 36.50Bs
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NO_PRODUCTS');
        expect(result.userMessage).toBe('No se pudieron extraer productos del PDF.');
      }
    });

    it('falla con MISSING_RATE si falta la tasa BCV', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_RATE');
        expect(result.userMessage).toBe('No se encontró la tasa BCV en el PDF.');
      }
    });

    it('falla con MISSING_RATE si hay tasas BCV en conflicto', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
TASA DEL DIA (BCV): 37.00Bs
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_RATE');
        expect(result.userMessage).toBe('No se encontró la tasa BCV en el PDF.');
      }
    });

    it('falla con MISSING_RATE si la tasa BCV es <= 0', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 0.00Bs
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_RATE');
        expect(result.userMessage).toBe('No se encontró la tasa BCV en el PDF.');
      }
    });

    it('falla con MISSING_DATE si falta la fecha', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_DATE');
        expect(result.userMessage).toBe('No se encontró la fecha de la lista de precios en el PDF.');
      }
    });

    it('falla con MISSING_DATE si la fecha no existe en el calendario (ej. 31/02/2026)', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
31/02/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_DATE');
        expect(result.userMessage).toBe('No se encontró la fecha de la lista de precios en el PDF.');
      }
    });

    it('falla con MISSING_DATE si la fecha está más de 1 día en el futuro respecto a Caracas', () => {
      // fixedNow es 16/10/2026. 18/10/2026 es +2 días -> debe fallar
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
18/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_DATE');
        expect(result.userMessage).toBe('No se encontró la fecha de la lista de precios en el PDF.');
      }
    });

    it('falla con MISSING_DATE si hay fechas en conflicto', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
15/10/2026 FECHA:
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_DATE');
        expect(result.userMessage).toBe('No se encontró la fecha de la lista de precios en el PDF.');
      }
    });

    it('falla con NO_PRODUCTS si no hay líneas de producto válidas', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
16/10/2026 FECHA:
Línea sin formato de producto
`;
      const result = parseDistributorTextForApp(text, { now: fixedNow });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NO_PRODUCTS');
        expect(result.userMessage).toBe('No se pudieron extraer productos del PDF.');
      }
    });

    it('falla si duplicatePriceStrategy es "error" ante duplicados con precios distintos', () => {
      const text = `
${COMPANY_MARKER}
${TITLE_MARKER}
TASA DEL DIA (BCV): 36.50Bs
16/10/2026 FECHA:
Bs 50.00 HARINA PAN 1KG
Bs 60.00 HARINA PAN 1KG
`;
      const result = parseDistributorTextForApp(text, {
        now: fixedNow,
        duplicatePriceStrategy: 'error',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NO_PRODUCTS');
        expect(result.userMessage).toBe('No se pudieron extraer productos del PDF.');
      }
    });
  });

  describe('parseDistributorPdfForApp - Pruebas con bytes PDF reales', () => {
    it('parsea un PDF en memoria extrayendo texto, productos y total de páginas', async () => {
      const pdfBytes = createMinimalPdf([
        COMPANY_MARKER,
        TITLE_MARKER,
        'TASA DEL DIA (BCV): 36.50Bs',
        '16/10/2026 FECHA:',
        'Bs 1234.50 HARINA PAN 1KG X 20 UND',
      ]);

      const result = await parseDistributorPdfForApp(pdfBytes, { now: fixedNow });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.priceListDate).toBe('2026-10-16');
        expect(result.bcvRate).toBe(36.5);
        expect(result.pages).toBe(1);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].displayName).toBe('Harina Pan 1kg');
        expect(result.products[0].boxPriceBs).toBe(1234.5);
      }
    });

    it('maneja buffers vacíos retornando error sin lanzar excepciones no controladas', async () => {
      const emptyBytes = new Uint8Array(0);
      const result = await parseDistributorPdfForApp(emptyBytes);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NO_PRODUCTS');
        expect(result.userMessage).toBe('No se pudieron extraer productos del PDF.');
      }
    });

    it('maneja bytes corruptos retornando error sin lanzar excepciones no controladas', async () => {
      const corruptedBytes = new TextEncoder().encode('ESTO NO ES UN PDF');
      const result = await parseDistributorPdfForApp(corruptedBytes);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NO_PRODUCTS');
        expect(result.userMessage).toBe('No se pudieron extraer productos del PDF.');
      }
    });
  });

  describe('parseDistributorText - Compatibilidad con la API original', () => {
    it('mantiene la misma firma y estructura de retorno que parse-distributor-pdf.mjs', () => {
      const parsed = parseDistributorText(validTextSample);
      expect(parsed.pdfDate).toBe('2026-10-16');
      expect(parsed.bcvRate).toBe('36.50');
      expect(parsed.products).toHaveLength(3);
      expect(parsed.extraction.productCount).toBe(3);
    });
  });
});
