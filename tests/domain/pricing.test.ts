import { describe, it, expect } from 'vitest';
import {
  roundHalfUp2,
  resolveStoreProductPricing,
  resolveOpenListItemPricing,
  calculateListSummary,
} from '@/lib/domain/pricing';
import type { ListItemForSummary } from '@/lib/domain/pricing';

describe('pricing.ts - Cálculos de precios, márgenes, totales y redondeo', () => {
  describe('roundHalfUp2', () => {
    it('redondea a dos decimales con medio hacia arriba (>= 5 hacia arriba)', () => {
      expect(roundHalfUp2(10.125)).toBe(10.13);
      expect(roundHalfUp2(10.124)).toBe(10.12);
      expect(roundHalfUp2(1.235)).toBe(1.24);
      expect(roundHalfUp2(1.234)).toBe(1.23);
      expect(roundHalfUp2(0)).toBe(0);
      expect(roundHalfUp2(100.555)).toBe(100.56);
      expect(roundHalfUp2(100.554)).toBe(100.55);
    });

    it('maneja números negativos correctamente', () => {
      expect(roundHalfUp2(-10.125)).toBe(-10.13);
      expect(roundHalfUp2(-10.124)).toBe(-10.12);
    });
  });

  describe('resolveStoreProductPricing', () => {
    it('usa el precio manual sobre el del catálogo cuando existe', () => {
      const result = resolveStoreProductPricing({
        manualPriceBs: 120,
        catalogPriceBs: 100,
        unitsPerBox: 12,
        margins: [0, 20],
      });

      expect(result.baseBoxPriceBs).toBe(120);
      expect(result.unitPriceBs).toBe(10); // 120 / 12
      expect(result.salePrices).toEqual([
        { marginPercent: 0, salePriceBs: 10 },
        { marginPercent: 20, salePriceBs: 12 }, // 10 * 1.2
      ]);
    });

    it('usa el precio del catálogo cuando no hay precio manual', () => {
      const result = resolveStoreProductPricing({
        manualPriceBs: null,
        catalogPriceBs: 60,
        unitsPerBox: 6,
        margins: [10],
      });

      expect(result.baseBoxPriceBs).toBe(60);
      expect(result.unitPriceBs).toBe(10);
      expect(result.salePrices).toEqual([
        { marginPercent: 10, salePriceBs: 11 },
      ]);
    });

    it('retorna null y lista vacía cuando no hay precio ni manual ni en catálogo (Sin precio)', () => {
      const result = resolveStoreProductPricing({
        manualPriceBs: null,
        catalogPriceBs: null,
        unitsPerBox: 1,
        margins: [20],
      });

      expect(result.baseBoxPriceBs).toBeNull();
      expect(result.unitPriceBs).toBeNull();
      expect(result.salePrices).toEqual([]);
    });

    it('aplica redondeo con precisión en divisiones no enteras', () => {
      // 100 Bs / 3 unidades = 33.333333333333... Bs por unidad
      const result = resolveStoreProductPricing({
        manualPriceBs: 100,
        catalogPriceBs: null,
        unitsPerBox: 3,
        margins: [20],
      });

      expect(result.unitPriceBs).toBe(33.33);
      // (100 / 3) * 1.20 = 40.00 exacto
      expect(result.salePrices).toEqual([
        { marginPercent: 20, salePriceBs: 40 },
      ]);
    });
  });

  describe('resolveOpenListItemPricing', () => {
    it('usa nombre personalizado y precio de tienda si está en Mi tienda', () => {
      const result = resolveOpenListItemPricing({
        isInStore: true,
        customName: 'Harina Especial',
        manualPriceBs: 45,
        catalogDisplayName: 'Harina PAN 1kg',
        catalogPriceBs: 40,
        quantity: 2,
        currencyTag: 'VES',
      });

      expect(result.productName).toBe('Harina Especial');
      expect(result.boxPriceBs).toBe(45);
      expect(result.lineTotalBs).toBe(90);
    });

    it('usa nombre de catálogo si el producto no está en Mi tienda', () => {
      const result = resolveOpenListItemPricing({
        isInStore: false,
        customName: null,
        manualPriceBs: null,
        catalogDisplayName: 'Arroz Blanco 1kg',
        catalogPriceBs: 35.5,
        quantity: 3,
        currencyTag: 'VES',
      });

      expect(result.productName).toBe('Arroz Blanco 1kg');
      expect(result.boxPriceBs).toBe(35.5);
      expect(result.lineTotalBs).toBe(106.5);
    });

    it('asigna null a boxPriceBs y lineTotalBs si el producto está Sin precio', () => {
      const result = resolveOpenListItemPricing({
        isInStore: false,
        customName: null,
        manualPriceBs: null,
        catalogDisplayName: 'Café Molido 500g',
        catalogPriceBs: null,
        quantity: 5,
        currencyTag: 'VES',
      });

      expect(result.productName).toBe('Café Molido 500g');
      expect(result.boxPriceBs).toBeNull();
      expect(result.lineTotalBs).toBeNull();
    });
  });

  describe('calculateListSummary', () => {
    it('suma únicamente líneas VES con precio y calcula métricas', () => {
      const items: ListItemForSummary[] = [
        { currencyTag: 'VES', boxPriceBs: 50, quantity: 2 }, // Total: 100
        { currencyTag: 'VES', boxPriceBs: 30, quantity: 1 }, // Total: 30
        { currencyTag: 'USD', boxPriceBs: 10, quantity: 4 }, // USD: no suma al total en Bs
        { currencyTag: 'VES', boxPriceBs: null, quantity: 2 }, // Sin precio: no suma
      ];

      const summary = calculateListSummary(items);
      expect(summary.totalBs).toBe(130);
      expect(summary.itemCount).toBe(4);
      expect(summary.usdItemCount).toBe(1);
      expect(summary.pricelessItemCount).toBe(1);
    });

    it('devuelve totalBs 0 cuando todas las líneas están en USD', () => {
      const items: ListItemForSummary[] = [
        { currencyTag: 'USD', boxPriceBs: 15, quantity: 2 },
        { currencyTag: 'USD', boxPriceBs: 25, quantity: 1 },
      ];

      const summary = calculateListSummary(items);
      expect(summary.totalBs).toBe(0);
      expect(summary.itemCount).toBe(2);
      expect(summary.usdItemCount).toBe(2);
      expect(summary.pricelessItemCount).toBe(0);
    });

    it('devuelve 0 para lista vacía', () => {
      const summary = calculateListSummary([]);
      expect(summary.totalBs).toBe(0);
      expect(summary.itemCount).toBe(0);
      expect(summary.usdItemCount).toBe(0);
      expect(summary.pricelessItemCount).toBe(0);
    });
  });
});
