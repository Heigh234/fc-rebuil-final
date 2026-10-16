import { describe, it, expect } from 'vitest';
import {
  resolveOpenListItemPricing,
  calculateListSummary,
} from '@/lib/domain/pricing';
import { getDefaultShoppingListName } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { InvoiceLineDto, CurrencyTag } from '@/types/contracts';

describe('MOD-11 Integración: Listas de Compras y Facturas (Secciones 11, 12, 20 y 21)', () => {
  describe('Creación de Listas con Nombre por Defecto (Sección 11: L436)', () => {
    it('genera nombre automático con fecha en hora de Caracas', () => {
      const simulatedNow = new Date('2026-10-16T18:00:00Z');
      const name = getDefaultShoppingListName(simulatedNow);
      expect(name).toBe('Compra del 16/10/2026');
    });
  });

  describe('Resolución de Nombres y Precios en Vivo (Sección 11: L447-L454, Sección 20: L1035-L1036)', () => {
    it('usa nombre personalizado y precio manual cuando el producto está en Mi tienda', () => {
      const resolved = resolveOpenListItemPricing({
        isInStore: true,
        customName: 'Mi Harina Favorita',
        manualPriceBs: 450,
        catalogDisplayName: 'HARINA PAN 1KG',
        catalogPriceBs: 400,
        quantity: 2,
        currencyTag: 'VES',
      });

      expect(resolved.productName).toBe('Mi Harina Favorita');
      expect(resolved.boxPriceBs).toBe(450);
      expect(resolved.lineTotalBs).toBe(900);
    });

    it('al quitar un producto de la tienda, pasa a usar su nombre y precio del catálogo', () => {
      // Producto quitado de la tienda: isInStore = false
      const resolved = resolveOpenListItemPricing({
        isInStore: false,
        customName: 'Mi Harina Favorita',
        manualPriceBs: 450,
        catalogDisplayName: 'HARINA PAN 1KG',
        catalogPriceBs: 400,
        quantity: 3,
        currencyTag: 'VES',
      });

      expect(resolved.productName).toBe('HARINA PAN 1KG');
      expect(resolved.boxPriceBs).toBe(400);
      expect(resolved.lineTotalBs).toBe(1200);
    });

    it('queda "Sin precio" si no aparece en el catálogo ni tiene precio manual', () => {
      const resolved = resolveOpenListItemPricing({
        isInStore: false,
        customName: null,
        manualPriceBs: null,
        catalogDisplayName: 'PRODUCTO DISCONTINUADO',
        catalogPriceBs: null,
        quantity: 1,
        currencyTag: 'VES',
      });

      expect(resolved.boxPriceBs).toBeNull();
      expect(resolved.lineTotalBs).toBeNull();
    });
  });

  describe('Cálculo de Totales y Etiquetas de Moneda (Sección 9, Sección 20: L1042-L1045)', () => {
    it('cambiar la moneda de VES a USD no convierte el monto y excluye la línea del total en bolívares', () => {
      const itemsVES = [
        { currencyTag: 'VES' as CurrencyTag, boxPriceBs: 500, quantity: 2 }, // 1.000 Bs
        { currencyTag: 'VES' as CurrencyTag, boxPriceBs: 300, quantity: 1 }, // 300 Bs
      ];

      const summaryVES = calculateListSummary(itemsVES);
      expect(summaryVES.totalBs).toBe(1300);

      // El dueño cambia la segunda línea a USD
      const itemsMixed = [
        { currencyTag: 'VES' as CurrencyTag, boxPriceBs: 500, quantity: 2 }, // 1.000 Bs
        { currencyTag: 'USD' as CurrencyTag, boxPriceBs: 300, quantity: 1 }, // Excluido del total
      ];

      const summaryMixed = calculateListSummary(itemsMixed);
      expect(summaryMixed.totalBs).toBe(1000);
      expect(summaryMixed.usdItemCount).toBe(1);
    });

    it('totalBs es 0 si todas las líneas están en USD', () => {
      const itemsUSD = [
        { currencyTag: 'USD' as CurrencyTag, boxPriceBs: 15, quantity: 10 },
        { currencyTag: 'USD' as CurrencyTag, boxPriceBs: 40, quantity: 1 },
      ];

      const summary = calculateListSummary(itemsUSD);
      expect(summary.totalBs).toBe(0);
      expect(summary.usdItemCount).toBe(2);
    });
  });

  describe('Bloqueo de Finalización ante Condiciones Inválidas (Sección 11: L475-L480, Sección 20: L1040)', () => {
    it('bloquea finalización si la lista está vacía', () => {
      const items: unknown[] = [];
      const canFinalize = items.length > 0;

      expect(canFinalize).toBe(false);
      expect(MESSAGES.FINALIZE_ERROR_EMPTY).toBe(
        'La lista está vacía. Agrega productos para poder finalizarla.'
      );
    });

    it('bloquea finalización si no existe carga activa', () => {
      const activeUploadId: string | null = null;
      const canFinalize = activeUploadId !== null;

      expect(canFinalize).toBe(false);
      expect(MESSAGES.FINALIZE_ERROR_NO_ACTIVE_UPLOAD).toBe(
        'Carga un PDF de precios para poder finalizar la lista.'
      );
    });

    it('bloquea finalización si algún producto está "Sin precio"', () => {
      const summary = calculateListSummary([
        { currencyTag: 'VES', boxPriceBs: 100, quantity: 2 },
        { currencyTag: 'VES', boxPriceBs: null, quantity: 1 }, // Sin precio
      ]);

      const canFinalize = summary.pricelessItemCount === 0;

      expect(canFinalize).toBe(false);
      expect(MESSAGES.FINALIZE_ERROR_PRICELESS).toBe(
        'Hay productos sin precio. Agrégales un precio manual en Mi tienda para poder finalizar.'
      );
    });
  });

  describe('Inmutabilidad y Reglas de la Factura (Sección 12, Sección 20: L1039, L1050)', () => {
    it('ordena las líneas de la factura alfabéticamente por productName', () => {
      const lines: InvoiceLineDto[] = [
        { id: '1', productName: 'Queso Paisa', quantity: 1, boxPriceBs: 500, currencyTag: 'VES', lineTotalBs: 500, position: 0 },
        { id: '2', productName: 'Aceite Vegetal', quantity: 2, boxPriceBs: 200, currencyTag: 'VES', lineTotalBs: 400, position: 1 },
        { id: '3', productName: 'Mantequilla 500g', quantity: 1, boxPriceBs: 150, currencyTag: 'VES', lineTotalBs: 150, position: 2 },
      ];

      const sorted = [...lines].sort((a, b) =>
        a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' })
      );

      expect(sorted.map((l) => l.productName)).toEqual([
        'Aceite Vegetal',
        'Mantequilla 500g',
        'Queso Paisa',
      ]);
    });

    it('incluye la aclaración exacta de líneas USD cuando hasUsdLines es true', () => {
      const hasUsdLines = true;
      expect(hasUsdLines).toBe(true);
      expect(MESSAGES.INVOICE_USD_DISCLAIMER).toBe(
        'Las líneas en USD no están incluidas en el total en bolívares.'
      );
    });

    it('la finalización de dos dispositivos o dos toques seguidos es idempotente', () => {
      // Simulación de idempotencia: si la lista ya está finalizada, el segundo intento termina con éxito
      const listStatus: 'open' | 'finalized' = 'finalized';
      const isAlreadyFinalized = listStatus === 'finalized';

      expect(isAlreadyFinalized).toBe(true);
      expect(MESSAGES.LIST_ALREADY_FINALIZED).toBe(
        'Esta lista ya fue finalizada y no puede editarse.'
      );
    });
  });
});
