import { describe, it, expect } from 'vitest';
import { matchesMultiWordQuery } from '@/lib/domain/search';
import { resolveStoreProductPricing } from '@/lib/domain/pricing';
import { storeProductInputSchema } from '@/lib/domain/validations';
import { formatBs } from '@/lib/domain/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { StoreProductDto } from '@/types/contracts';

describe('MOD-09: Catálogo y Mi Tienda - Lógica de Dominio y UI', () => {
  describe('Indicadores de variación de precio en Catálogo (Sección 17: L748)', () => {
    it('detecta aumento de precio (rojo / precio sube)', () => {
      const currentPriceBs: number = 1500;
      const previousPriceBs: number | null = 1200;

      const hasChange = previousPriceBs !== null && currentPriceBs !== previousPriceBs;
      const isIncrease = previousPriceBs !== null && currentPriceBs > previousPriceBs;

      expect(hasChange).toBe(true);
      expect(isIncrease).toBe(true);
    });

    it('detecta disminución de precio (verde / precio baja)', () => {
      const currentPriceBs: number = 950;
      const previousPriceBs: number | null = 1100;

      const hasChange = previousPriceBs !== null && currentPriceBs !== previousPriceBs;
      const isDecrease = previousPriceBs !== null && currentPriceBs < previousPriceBs;

      expect(hasChange).toBe(true);
      expect(isDecrease).toBe(true);
    });

    it('no muestra indicador si el precio es igual o previousPriceBs es null', () => {
      const current: number = 1000;
      const previousSame: number | null = 1000;
      expect(previousSame !== null && current !== previousSame).toBe(false);

      const previousNull: number | null = null;
      expect(previousNull !== null).toBe(false);
    });
  });

  describe('Búsqueda multi-palabra insensible a tildes (Sección 17: L755-L758)', () => {
    it('filtra en Catálogo por displayName y sourceName', () => {
      const product = {
        displayName: 'Harina PAN Blanca 1kg',
        sourceName: 'HAR PAN BLANCA 20X1KG',
      };

      // Múltiples palabras en desorden y sin tildes
      expect(matchesMultiWordQuery('blanca harina', [product.displayName, product.sourceName])).toBe(true);
      expect(matchesMultiWordQuery('PAN 20X1KG', [product.displayName, product.sourceName])).toBe(true);
      expect(matchesMultiWordQuery('arroz', [product.displayName, product.sourceName])).toBe(false);
    });

    it('filtra en Mi Tienda por customName y catalogDisplayName', () => {
      const storeItem = {
        customName: 'Café Fama de América 250g',
        catalogDisplayName: 'Café Molido Clásico',
      };

      expect(matchesMultiWordQuery('cafe fama', [storeItem.customName, storeItem.catalogDisplayName])).toBe(true);
      expect(matchesMultiWordQuery('molido clasico', [storeItem.customName, storeItem.catalogDisplayName])).toBe(true);
      expect(matchesMultiWordQuery('azucar', [storeItem.customName, storeItem.catalogDisplayName])).toBe(false);
    });
  });

  describe('Validación de Edición de Producto de Tienda (Sección 18: L877-L884)', () => {
    it('valida nombre obligatorio y máximo 200 caracteres', () => {
      const emptyResult = storeProductInputSchema.safeParse({
        customName: '   ',
        unitsPerBox: 1,
        margins: [0],
      });
      expect(emptyResult.success).toBe(false);
      if (!emptyResult.success) {
        expect(emptyResult.error.issues[0].message).toBe(MESSAGES.ERROR_NAME_REQUIRED);
      }

      const longResult = storeProductInputSchema.safeParse({
        customName: 'A'.repeat(201),
        unitsPerBox: 1,
        margins: [0],
      });
      expect(longResult.success).toBe(false);
      if (!longResult.success) {
        expect(longResult.error.issues[0].message).toBe(MESSAGES.ERROR_NAME_TOO_LONG);
      }
    });

    it('valida precio manual > 0 si está presente, y lo acepta opcional', () => {
      const optionalResult = storeProductInputSchema.safeParse({
        customName: 'Galletas María',
        manualPriceBs: null,
        unitsPerBox: 12,
        margins: [15],
      });
      expect(optionalResult.success).toBe(true);

      const invalidPrice = storeProductInputSchema.safeParse({
        customName: 'Galletas María',
        manualPriceBs: -10,
        unitsPerBox: 12,
        margins: [15],
      });
      expect(invalidPrice.success).toBe(false);
      if (!invalidPrice.success) {
        expect(invalidPrice.error.issues[0].message).toBe(MESSAGES.ERROR_PRICE_POSITIVE);
      }
    });

    it('valida unidades por caja entre 1 y 9999', () => {
      const zeroUnits = storeProductInputSchema.safeParse({
        customName: 'Arroz',
        unitsPerBox: 0,
        margins: [0],
      });
      expect(zeroUnits.success).toBe(false);
      if (!zeroUnits.success) {
        expect(zeroUnits.error.issues[0].message).toBe(MESSAGES.ERROR_UNITS_RANGE);
      }

      const tenThousand = storeProductInputSchema.safeParse({
        customName: 'Arroz',
        unitsPerBox: 10000,
        margins: [0],
      });
      expect(tenThousand.success).toBe(false);
    });

    it('valida márgenes: min 1, max 5, rango 0-500% y sin duplicados', () => {
      const noMargins = storeProductInputSchema.safeParse({
        customName: 'Pasta',
        unitsPerBox: 1,
        margins: [],
      });
      expect(noMargins.success).toBe(false);
      if (!noMargins.success) {
        expect(noMargins.error.issues[0].message).toBe(MESSAGES.ERROR_MARGIN_MIN);
      }

      const sixMargins = storeProductInputSchema.safeParse({
        customName: 'Pasta',
        unitsPerBox: 1,
        margins: [10, 20, 30, 40, 50, 60],
      });
      expect(sixMargins.success).toBe(false);
      if (!sixMargins.success) {
        expect(sixMargins.error.issues[0].message).toBe(MESSAGES.ERROR_MARGIN_MAX);
      }

      const duplicateMargins = storeProductInputSchema.safeParse({
        customName: 'Pasta',
        unitsPerBox: 1,
        margins: [20, 20],
      });
      expect(duplicateMargins.success).toBe(false);
      if (!duplicateMargins.success) {
        expect(duplicateMargins.error.issues[0].message).toBe(MESSAGES.ERROR_MARGIN_DUPLICATE);
      }

      const outOfRange = storeProductInputSchema.safeParse({
        customName: 'Pasta',
        unitsPerBox: 1,
        margins: [550],
      });
      expect(outOfRange.success).toBe(false);
      if (!outOfRange.success) {
        expect(outOfRange.error.issues[0].message).toBe(MESSAGES.ERROR_MARGIN_RANGE);
      }
    });
  });

  describe('Vista Previa en Vivo de Precios (Sección 17: L729)', () => {
    it('recalcula precio unitario y márgenes en base al precio manual si existe', () => {
      const pricing = resolveStoreProductPricing({
        manualPriceBs: 600,
        catalogPriceBs: 500, // Debe prevalecer el manual
        unitsPerBox: 12,
        margins: [0, 25, 50],
      });

      expect(pricing.baseBoxPriceBs).toBe(600);
      expect(pricing.unitPriceBs).toBe(50); // 600 / 12 = 50
      expect(pricing.salePrices).toEqual([
        { marginPercent: 0, salePriceBs: 50 },
        { marginPercent: 25, salePriceBs: 62.5 },
        { marginPercent: 50, salePriceBs: 75 },
      ]);
    });

    it('recalcula usando precio de catálogo si manualPriceBs es null', () => {
      const pricing = resolveStoreProductPricing({
        manualPriceBs: null,
        catalogPriceBs: 1200,
        unitsPerBox: 24,
        margins: [20],
      });

      expect(pricing.baseBoxPriceBs).toBe(1200);
      expect(pricing.unitPriceBs).toBe(50); // 1200 / 24 = 50
      expect(pricing.salePrices).toEqual([
        { marginPercent: 20, salePriceBs: 60 },
      ]);
    });

    it('devuelve null / lista vacía si no hay precio de catálogo ni manual', () => {
      const pricing = resolveStoreProductPricing({
        manualPriceBs: null,
        catalogPriceBs: null,
        unitsPerBox: 1,
        margins: [0],
      });

      expect(pricing.baseBoxPriceBs).toBeNull();
      expect(pricing.unitPriceBs).toBeNull();
      expect(pricing.salePrices).toEqual([]);
    });
  });

  describe('MOD-M02: Indicadores de variación de precio en Mi Tienda (REQ-M03)', () => {
    function computeStoreCardIndicatorState(product: StoreProductDto) {
      const hasPreviousPrice =
        product.previousPriceBs !== null && product.baseBoxPriceBs !== null;
      const isPriceUp =
        hasPreviousPrice && product.baseBoxPriceBs! > product.previousPriceBs!;
      const isPriceDown =
        hasPreviousPrice && product.baseBoxPriceBs! < product.previousPriceBs!;
      const showPriceIndicator = isPriceUp || isPriceDown;

      const title = showPriceIndicator
        ? isPriceUp
          ? `Precio anterior: ${formatBs(product.previousPriceBs!)} (subió)`
          : `Precio anterior: ${formatBs(product.previousPriceBs!)} (bajó)`
        : null;

      return {
        hasPreviousPrice,
        isPriceUp,
        isPriceDown,
        showPriceIndicator,
        title,
      };
    }

    const baseProduct: StoreProductDto = {
      id: 'sp-1',
      productId: 'p-1',
      catalogDisplayName: 'Galletas Maria 24x100g',
      customName: 'Galletas María',
      manualPriceBs: null,
      unitsPerBox: 24,
      margins: [20],
      position: 0,
      baseBoxPriceBs: 1500,
      previousPriceBs: 1200,
      unitPriceBs: 62.5,
      salePrices: [{ marginPercent: 20, salePriceBs: 75 }],
    };

    it('detecta aumento de precio por caja en Mi Tienda (rojo / subió)', () => {
      const state = computeStoreCardIndicatorState(baseProduct);

      expect(state.showPriceIndicator).toBe(true);
      expect(state.isPriceUp).toBe(true);
      expect(state.isPriceDown).toBe(false);
      expect(state.title).toBe(`Precio anterior: ${formatBs(1200)} (subió)`);
    });

    it('detecta disminución de precio por caja en Mi Tienda (verde / bajó)', () => {
      const state = computeStoreCardIndicatorState({
        ...baseProduct,
        baseBoxPriceBs: 1000,
        previousPriceBs: 1200,
      });

      expect(state.showPriceIndicator).toBe(true);
      expect(state.isPriceUp).toBe(false);
      expect(state.isPriceDown).toBe(true);
      expect(state.title).toBe(`Precio anterior: ${formatBs(1200)} (bajó)`);
    });

    it('respeta precio manual para la variación si fue fijado', () => {
      // Si el catálogo marcaba 1200 en la lista anterior, pero el dueño fijó manual a 1400:
      const state = computeStoreCardIndicatorState({
        ...baseProduct,
        manualPriceBs: 1400,
        baseBoxPriceBs: 1400,
        previousPriceBs: 1200,
      });

      expect(state.showPriceIndicator).toBe(true);
      expect(state.isPriceUp).toBe(true);
    });

    it('no muestra indicador si el precio por caja no varió', () => {
      const state = computeStoreCardIndicatorState({
        ...baseProduct,
        baseBoxPriceBs: 1200,
        previousPriceBs: 1200,
      });

      expect(state.showPriceIndicator).toBe(false);
      expect(state.isPriceUp).toBe(false);
      expect(state.isPriceDown).toBe(false);
      expect(state.title).toBeNull();
    });

    it('no muestra indicador si el producto no tiene precio anterior (previousPriceBs: null)', () => {
      const state = computeStoreCardIndicatorState({
        ...baseProduct,
        previousPriceBs: null,
      });

      expect(state.showPriceIndicator).toBe(false);
      expect(state.isPriceUp).toBe(false);
      expect(state.isPriceDown).toBe(false);
    });

    it('no muestra indicador si el producto está "Sin precio" (baseBoxPriceBs: null)', () => {
      const state = computeStoreCardIndicatorState({
        ...baseProduct,
        baseBoxPriceBs: null,
        previousPriceBs: 1200,
      });

      expect(state.showPriceIndicator).toBe(false);
      expect(state.isPriceUp).toBe(false);
      expect(state.isPriceDown).toBe(false);
    });
  });
});
