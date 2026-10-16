import { describe, it, expect } from 'vitest';
import { createStoreProductSchema, storeProductInputSchema, reorderSchema } from '@/lib/domain/validations';
import { resolveStoreProductPricing } from '@/lib/domain/pricing';
import { MESSAGES } from '@/lib/i18n/messages';

describe('Store Domain Validations & Pricing for /api/store', () => {
  it('validates creation of store product with default values', () => {
    const parsed = createStoreProductSchema.parse({
      productId: 'prod-uuid-1',
    });

    expect(parsed.productId).toBe('prod-uuid-1');
    expect(parsed.unitsPerBox).toBe(1);
    expect(parsed.margins).toEqual([0]);
    expect(parsed.customName).toBeUndefined();
    expect(parsed.manualPriceBs).toBeUndefined();
  });

  it('rejects store product with invalid unitsPerBox or margins', () => {
    const invalidUnits = createStoreProductSchema.safeParse({
      productId: 'p-1',
      unitsPerBox: 0,
    });
    expect(invalidUnits.success).toBe(false);

    const duplicateMargins = createStoreProductSchema.safeParse({
      productId: 'p-1',
      margins: [10, 10],
    });
    expect(duplicateMargins.success).toBe(false);
    if (!duplicateMargins.success) {
      expect(duplicateMargins.error.issues[0].message).toBe(MESSAGES.ERROR_MARGIN_DUPLICATE);
    }
  });

  it('rejects reorder with empty array or duplicate IDs', () => {
    const empty = reorderSchema.safeParse({ orderedIds: [] });
    expect(empty.success).toBe(false);

    const dupes = reorderSchema.safeParse({ orderedIds: ['id-1', 'id-1'] });
    expect(dupes.success).toBe(false);
  });

  it('resolves pricing correctly when manual price overrides catalog price', () => {
    const pricing = resolveStoreProductPricing({
      manualPriceBs: 250,
      catalogPriceBs: 200,
      unitsPerBox: 24,
      margins: [0, 20, 30],
    });

    expect(pricing.baseBoxPriceBs).toBe(250);
    // 250 / 24 = 10.41666... -> 10.42
    expect(pricing.unitPriceBs).toBe(10.42);
    expect(pricing.salePrices).toHaveLength(3);
    expect(pricing.salePrices[0]).toEqual({ marginPercent: 0, salePriceBs: 10.42 });
    // 10.41666... * 1.2 = 12.50
    expect(pricing.salePrices[1]).toEqual({ marginPercent: 20, salePriceBs: 12.50 });
  });

  it('returns null prices when both manual and catalog prices are missing', () => {
    const pricing = resolveStoreProductPricing({
      manualPriceBs: null,
      catalogPriceBs: null,
      unitsPerBox: 12,
      margins: [20],
    });

    expect(pricing.baseBoxPriceBs).toBeNull();
    expect(pricing.unitPriceBs).toBeNull();
    expect(pricing.salePrices).toEqual([]);
  });
});
