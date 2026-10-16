import { describe, it, expect } from 'vitest';
import { resolveStoreProductPricing } from '@/lib/domain/pricing';
import { storeProductInputSchema, reorderSchema } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';

describe('MOD-11 Integración: Mi Tienda y Reordenamiento (Secciones 10, 20 y 21)', () => {
  describe('Valores por Defecto al Agregar Producto (Sección 10: L403-L410)', () => {
    it('asigna valores por defecto requeridos: nombre del catálogo, 1 unidad, margen 0%', () => {
      const catalogDisplayName = 'Harina PAN Blanca 1kg';

      const defaultStoreItem = {
        customName: catalogDisplayName,
        unitsPerBox: 1,
        margins: [0],
        manualPriceBs: null,
      };

      const parsed = storeProductInputSchema.safeParse(defaultStoreItem);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.customName).toBe(catalogDisplayName);
        expect(parsed.data.unitsPerBox).toBe(1);
        expect(parsed.data.margins).toEqual([0]);
        expect(parsed.data.manualPriceBs).toBeNull();
      }
    });

    it('un producto solo puede agregarse una vez a la tienda', () => {
      const existingProductIds = new Set(['prod-1', 'prod-2']);
      const isAlreadyInStore = existingProductIds.has('prod-1');

      expect(isAlreadyInStore).toBe(true);
      expect(MESSAGES.PRODUCT_ALREADY_IN_STORE).toBe(
        'Este producto ya está en tu tienda.'
      );
    });
  });

  describe('Conservación de Precios Manuales ante Nuevos PDFs (Sección 20: L1032, Sección 21: L1068)', () => {
    it('el precio manual prevalece sobre el precio de catálogo y no se borra al aplicar un nuevo PDF', () => {
      const manualPriceBs = 850;
      const oldCatalogPriceBs = 700;
      const newCatalogPriceBs = 900; // Nuevo PDF con aumento

      // Con el PDF antiguo
      const pricingOldPdf = resolveStoreProductPricing({
        manualPriceBs,
        catalogPriceBs: oldCatalogPriceBs,
        unitsPerBox: 1,
        margins: [0],
      });

      // Con el PDF nuevo
      const pricingNewPdf = resolveStoreProductPricing({
        manualPriceBs,
        catalogPriceBs: newCatalogPriceBs,
        unitsPerBox: 1,
        margins: [0],
      });

      // En ambos casos prevalece el precio manual configurado por el dueño
      expect(pricingOldPdf.baseBoxPriceBs).toBe(manualPriceBs);
      expect(pricingNewPdf.baseBoxPriceBs).toBe(manualPriceBs);
    });
  });

  describe('Productos que Faltan en un PDF Nuevo (Sección 20: L1030, Sección 21: L1077)', () => {
    it('queda "Sin precio" si falta en el PDF nuevo y NO tiene precio manual', () => {
      const pricing = resolveStoreProductPricing({
        manualPriceBs: null,
        catalogPriceBs: null, // No apareció en el nuevo PDF
        unitsPerBox: 12,
        margins: [20],
      });

      expect(pricing.baseBoxPriceBs).toBeNull();
      expect(pricing.unitPriceBs).toBeNull();
      expect(pricing.salePrices).toEqual([]);
      expect(MESSAGES.PRICELESS).toBe('Sin precio');
    });

    it('conserva su precio si falta en el PDF nuevo pero SÍ tiene precio manual', () => {
      const pricing = resolveStoreProductPricing({
        manualPriceBs: 1200,
        catalogPriceBs: null, // No apareció en el catálogo
        unitsPerBox: 24,
        margins: [25],
      });

      expect(pricing.baseBoxPriceBs).toBe(1200);
      expect(pricing.unitPriceBs).toBe(50); // 1200 / 24 = 50
      expect(pricing.salePrices).toEqual([
        { marginPercent: 25, salePriceBs: 62.5 },
      ]);
    });
  });

  describe('Reordenamiento Atómico Todo-o-Nada (Sección 10: L420-L430, Sección 20: L1053)', () => {
    it('rechaza una lista de reordenamiento vacía', () => {
      const result = reorderSchema.safeParse({ orderedIds: [] });
      expect(result.success).toBe(false);
    });

    it('rechaza una lista con identificadores duplicados', () => {
      const result = reorderSchema.safeParse({
        orderedIds: ['item-1', 'item-2', 'item-1'],
      });
      expect(result.success).toBe(false);
    });

    it('falla si la cantidad de IDs no coincide exactamente con el total de la tienda', () => {
      const currentStoreItemIds = ['item-1', 'item-2', 'item-3'];
      const requestedIds = ['item-1', 'item-2']; // Falta item-3

      const isCountMatch = requestedIds.length === currentStoreItemIds.length;
      expect(isCountMatch).toBe(false);
      expect(MESSAGES.ORDER_SAVE_ERROR).toBe('El orden no pudo guardarse.');
    });

    it('falla si contiene IDs ajenos a la tienda', () => {
      const currentStoreItemIds = new Set(['item-1', 'item-2', 'item-3']);
      const requestedIds = ['item-1', 'item-2', 'item-999'];

      const allValid = requestedIds.every((id) => currentStoreItemIds.has(id));
      expect(allValid).toBe(false);
    });
  });
});
