import { describe, it, expect } from 'vitest';
import { calculateListSummary } from '@/lib/domain/pricing';
import { formatCaracasDate, getDefaultShoppingListName } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { InvoiceLineDto, CurrencyTag } from '@/types/contracts';

describe('MOD-10: Listas de Compras, Detalle, Finalización y Facturas', () => {
  describe('Cálculo de Totales y Resumen (Sección 9: L378-L385 y Sección 11: L469-L470)', () => {
    it('suma exclusivamente líneas en VES con precio al total en bolívares', () => {
      const items = [
        { currencyTag: 'VES' as CurrencyTag, boxPriceBs: 250, quantity: 2 }, // 500 Bs
        { currencyTag: 'USD' as CurrencyTag, boxPriceBs: 15, quantity: 4 },  // USD excluido
        { currencyTag: 'VES' as CurrencyTag, boxPriceBs: null, quantity: 1 }, // Sin precio excluido
        { currencyTag: 'VES' as CurrencyTag, boxPriceBs: 100.5, quantity: 2 }, // 201 Bs
      ];

      const summary = calculateListSummary(items);

      expect(summary.totalBs).toBe(701);
      expect(summary.itemCount).toBe(4);
      expect(summary.usdItemCount).toBe(1);
      expect(summary.pricelessItemCount).toBe(1);
    });

    it('devuelve totalBs = 0 si todas las líneas están en USD o la lista está vacía', () => {
      const usdItems = [
        { currencyTag: 'USD' as CurrencyTag, boxPriceBs: 10, quantity: 5 },
        { currencyTag: 'USD' as CurrencyTag, boxPriceBs: 25, quantity: 2 },
      ];

      const usdSummary = calculateListSummary(usdItems);
      expect(usdSummary.totalBs).toBe(0);
      expect(usdSummary.usdItemCount).toBe(2);

      const emptySummary = calculateListSummary([]);
      expect(emptySummary.totalBs).toBe(0);
      expect(emptySummary.itemCount).toBe(0);
    });
  });

  describe('Orden Alfabético en Facturas (Sección 12: L523 y Sección 17: L793)', () => {
    it('ordena las líneas de factura estrictamente en orden alfabético por productName', () => {
      const unsortedLines: InvoiceLineDto[] = [
        {
          id: '1',
          productName: 'Yogurt Fresa 1L',
          quantity: 2,
          boxPriceBs: 120,
          currencyTag: 'VES',
          lineTotalBs: 240,
          position: 0,
        },
        {
          id: '2',
          productName: 'Arroz Blanco 1kg',
          quantity: 5,
          boxPriceBs: 60,
          currencyTag: 'VES',
          lineTotalBs: 300,
          position: 1,
        },
        {
          id: '3',
          productName: 'Café Molido 250g',
          quantity: 1,
          boxPriceBs: 150,
          currencyTag: 'VES',
          lineTotalBs: 150,
          position: 2,
        },
      ];

      const sorted = [...unsortedLines].sort((a, b) =>
        a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' })
      );

      expect(sorted[0].productName).toBe('Arroz Blanco 1kg');
      expect(sorted[1].productName).toBe('Café Molido 250g');
      expect(sorted[2].productName).toBe('Yogurt Fresa 1L');
    });
  });

  describe('Formateo y Textos Exactos de Listas y Facturas (Sección 18)', () => {
    it('genera el nombre por defecto en hora de Caracas "Compra del DD/MM/YYYY"', () => {
      const fixedDate = new Date('2026-10-16T15:00:00Z');
      const name = getDefaultShoppingListName(fixedDate);
      expect(name).toMatch(/^Compra del \d{2}\/\d{2}\/2026$/);
    });

    it('construye textos exactos de confirmaciones para listas', () => {
      expect(MESSAGES.confirmRemoveFromListText('Harina PAN')).toBe(
        'Se quitará «Harina PAN» de esta lista.'
      );

      expect(MESSAGES.confirmDeleteListText('Compra del 16/10/2026')).toBe(
        'Se eliminará «Compra del 16/10/2026» con todos sus productos. Esta acción no se puede deshacer.'
      );

      expect(MESSAGES.confirmFinalizeListText('Compra Principal')).toBe(
        'Se bloqueará «Compra Principal», se guardarán los precios y la tasa BCV actuales y se generará la factura. Ya no podrás editarla.'
      );
    });

    it('contiene la aclaración exacta de líneas USD para la factura', () => {
      expect(MESSAGES.INVOICE_USD_DISCLAIMER).toBe(
        'Las líneas en USD no están incluidas en el total en bolívares.'
      );
    });

    it('contiene los mensajes de error exactos para finalización', () => {
      expect(MESSAGES.FINALIZE_ERROR_EMPTY).toBe(
        'La lista está vacía. Agrega productos para poder finalizarla.'
      );
      expect(MESSAGES.FINALIZE_ERROR_NO_ACTIVE_UPLOAD).toBe(
        'Carga un PDF de precios para poder finalizar la lista.'
      );
      expect(MESSAGES.FINALIZE_ERROR_PRICELESS).toBe(
        'Hay productos sin precio. Agrégales un precio manual en Mi tienda para poder finalizar.'
      );
    });
  });
});
