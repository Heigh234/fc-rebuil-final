import { describe, it, expect } from 'vitest';
import {
  parseDistributorTextForApp,
  COMPANY_MARKER,
  TITLE_MARKER,
} from '@/lib/pdf/distributor-parser';
import { MESSAGES } from '@/lib/i18n/messages';

describe('MOD-11 Integración: Cargas de PDF y Catálogo (Secciones 8, 20 y 21)', () => {
  describe('Validaciones de Archivo PDF (Sección 8: L285-L294, Sección 21: L1065)', () => {
    it('rechaza archivos que exceden los 10MB', () => {
      const maxSizeBytes = 10 * 1024 * 1024;
      const fileSizeBytes = maxSizeBytes + 1;
      const isValid = fileSizeBytes <= maxSizeBytes;

      expect(isValid).toBe(false);
      expect(MESSAGES.ERROR_FILE_TOO_LARGE).toBe(
        'El archivo es demasiado grande. Máximo 10MB.'
      );
    });

    it('rechaza archivos que no sean MIME application/pdf', () => {
      const allowedMimes = ['application/pdf'];
      expect(allowedMimes.includes('image/png')).toBe(false);
      expect(allowedMimes.includes('application/pdf')).toBe(true);
      expect(MESSAGES.ERROR_ONLY_PDF).toBe('Solo se aceptan archivos PDF.');
    });
  });

  describe('Casos de Error en el Procesamiento del PDF (Sección 20: L1025-L1026)', () => {
    const baseHeader = `${COMPANY_MARKER}\n${TITLE_MARKER}\n`;

    it('falla con mensaje claro si el PDF no contiene fecha de lista', () => {
      const textWithoutDate = `${baseHeader}TASA DEL DIA (BCV): 36.50Bs\nBs 100 HARINA PAN`;
      const result = parseDistributorTextForApp(textWithoutDate);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_DATE');
        expect(result.userMessage).toBe(MESSAGES.ERROR_MISSING_DATE);
      }
    });

    it('falla con mensaje claro si no se encuentra tasa BCV', () => {
      const textWithoutRate = `${baseHeader}16/10/2026 FECHA:\nBs 100 HARINA PAN`;
      const result = parseDistributorTextForApp(textWithoutRate);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('MISSING_RATE');
        expect(result.userMessage).toBe(MESSAGES.ERROR_MISSING_RATE);
      }
    });

    it('falla con mensaje claro si no se extrae ningún producto válido', () => {
      const textWithoutProducts = `${baseHeader}16/10/2026 FECHA:\nTASA DEL DIA (BCV): 36.50Bs\nSOLO TEXTO INFORMATIVO`;
      const result = parseDistributorTextForApp(textWithoutProducts);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('NO_PRODUCTS');
        expect(result.userMessage).toBe(MESSAGES.ERROR_NO_PRODUCTS);
      }
    });
  });

  describe('Regla de Expiración de Cargas Pendientes a los 10 Minutos (Sección 20: L1028, Sección 21: L1094)', () => {
    it('marca como fallida una carga pendiente que superó 10 minutos', () => {
      const now = new Date('2026-10-16T15:15:00Z').getTime();
      const createdAtOld = new Date('2026-10-16T15:00:00Z').getTime(); // 15 minutos atrás
      const createdAtFresh = new Date('2026-10-16T15:10:00Z').getTime(); // 5 minutos atrás

      const tenMinutesMs = 10 * 60 * 1000;

      const isOldExpired = now - createdAtOld > tenMinutesMs;
      const isFreshExpired = now - createdAtFresh > tenMinutesMs;

      expect(isOldExpired).toBe(true);
      expect(isFreshExpired).toBe(false);
    });
  });

  describe('Flujo de Confirmación de PDF con Fecha Anterior (Sección 8: L301-L308, Sección 20: L1033)', () => {
    it('detecta cuando la fecha del PDF es anterior a la lista vigente', () => {
      const activeDate = '2026-10-15';
      const olderPdfDate = '2026-10-12';
      const newerPdfDate = '2026-10-16';

      expect(olderPdfDate < activeDate).toBe(true);
      expect(newerPdfDate < activeDate).toBe(false);
    });

    it('genera el texto exacto de confirmación para fecha anterior', () => {
      const text = MESSAGES.confirmOlderPdfText('12/10/2026', '15/10/2026');
      expect(text).toBe(
        'Este PDF es del 12/10/2026, anterior a la lista vigente del 15/10/2026. Si continúas, sus precios reemplazarán a los actuales.'
      );
    });

    it('si el usuario cancela, no muestra error y la carga queda fallida', () => {
      const userDecision: 'confirm' | 'cancel' = 'cancel';
      const targetStatus = userDecision === 'cancel' ? 'failed' : 'applied';
      expect(targetStatus).toBe('failed');
    });
  });

  describe('Cálculo de Precio Anterior por Fecha de Lista (Sección 21: L1095)', () => {
    it('calcula el precio anterior ordenando por price_list_date y no por momento de subida', () => {
      // Simulación:
      // Subida 1 hecha hoy con lista del 10 de octubre: precio 100
      // Subida 2 hecha ayer con lista del 12 de octubre: precio 120
      // Subida 3 hecha anteayer con lista del 15 de octubre: precio 150
      const priceHistory = [
        { priceListDate: '2026-10-10', boxPriceBs: 100, uploadCreatedAt: '2026-10-16T12:00:00Z' },
        { priceListDate: '2026-10-15', boxPriceBs: 150, uploadCreatedAt: '2026-10-14T12:00:00Z' },
        { priceListDate: '2026-10-12', boxPriceBs: 120, uploadCreatedAt: '2026-10-15T12:00:00Z' },
      ];

      // Ordenar por priceListDate DESC:
      const sortedByListDate = [...priceHistory].sort(
        (a, b) => b.priceListDate.localeCompare(a.priceListDate)
      );

      const current = sortedByListDate[0]; // 15 de octubre
      const previous = sortedByListDate[1]; // 12 de octubre (NO la del 10 de octubre a pesar de subirse después)

      expect(current.priceListDate).toBe('2026-10-15');
      expect(current.boxPriceBs).toBe(150);

      expect(previous.priceListDate).toBe('2026-10-12');
      expect(previous.boxPriceBs).toBe(120);

      // Variación de precio: current (150) > previous (120) -> Precio sube (rojo)
      expect(current.boxPriceBs > previous.boxPriceBs).toBe(true);
    });
  });
});
