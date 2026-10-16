import { describe, it, expect } from 'vitest';
import {
  resolveOpenListItemPricing,
  calculateListSummary,
  roundHalfUp2,
} from '@/lib/domain/pricing';
import { getDefaultShoppingListName } from '@/lib/domain/format';
import { shoppingListInputSchema, shoppingListItemInputSchema } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';

describe('Shopping Lists and Invoices Domain Logic for /api/lists & /api/invoices', () => {
  it('generates default list name with Caracas date', () => {
    const fixedDate = new Date('2026-10-16T15:00:00Z');
    const name = getDefaultShoppingListName(fixedDate);
    expect(name).toBe('Compra del 16/10/2026');
  });

  it('validates list name length between 1 and 100 characters', () => {
    expect(shoppingListInputSchema.safeParse({ name: '' }).success).toBe(false);
    expect(shoppingListInputSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
    expect(shoppingListInputSchema.safeParse({ name: 'Pedido Central' }).success).toBe(true);
  });

  it('validates shopping list item inputs (quantity 1..9999, currencyTag VES|USD)', () => {
    expect(shoppingListItemInputSchema.safeParse({ quantity: 0 }).success).toBe(false);
    expect(shoppingListItemInputSchema.safeParse({ quantity: 10000 }).success).toBe(false);
    expect(shoppingListItemInputSchema.safeParse({ quantity: 5, currencyTag: 'EUR' }).success).toBe(false);

    const valid = shoppingListItemInputSchema.parse({ quantity: 10, currencyTag: 'USD' });
    expect(valid.quantity).toBe(10);
    expect(valid.currencyTag).toBe('USD');
  });

  it('resolves item pricing in open lists: custom name & manual price when in store', () => {
    const resolved = resolveOpenListItemPricing({
      isInStore: true,
      customName: 'Galletas María Especiales',
      manualPriceBs: 150,
      catalogDisplayName: 'Galletas Maria 24x100g',
      catalogPriceBs: 120,
      quantity: 3,
      currencyTag: 'VES',
    });

    expect(resolved.productName).toBe('Galletas María Especiales');
    expect(resolved.boxPriceBs).toBe(150);
    expect(resolved.lineTotalBs).toBe(450);
  });

  it('resolves item pricing in open lists: catalog display name & catalog price when outside store', () => {
    const resolved = resolveOpenListItemPricing({
      isInStore: false,
      customName: undefined,
      manualPriceBs: undefined,
      catalogDisplayName: 'Harina PAN 1kg',
      catalogPriceBs: 80,
      quantity: 5,
      currencyTag: 'VES',
    });

    expect(resolved.productName).toBe('Harina PAN 1kg');
    expect(resolved.boxPriceBs).toBe(80);
    expect(resolved.lineTotalBs).toBe(400);
  });

  it('calculates list summary correctly separating VES totals from USD lines', () => {
    const items = [
      { currencyTag: 'VES' as const, boxPriceBs: 100, quantity: 2 }, // 200 Bs
      { currencyTag: 'VES' as const, boxPriceBs: 50.5, quantity: 4 }, // 202 Bs
      { currencyTag: 'USD' as const, boxPriceBs: 10, quantity: 3 },   // USD excluded from totalBs
      { currencyTag: 'VES' as const, boxPriceBs: null, quantity: 1 }, // Priceless item
    ];

    const summary = calculateListSummary(items);
    expect(summary.totalBs).toBe(402);
    expect(summary.itemCount).toBe(4);
    expect(summary.usdItemCount).toBe(1);
    expect(summary.pricelessItemCount).toBe(1);
  });

  it('sorts invoice lines alphabetically using Spanish locale collation', () => {
    const lines = [
      { productName: 'Zanahorias 1kg' },
      { productName: 'Arroz Blanco' },
      { productName: 'Árbol de Té' },
      { productName: 'Aceite de Maíz' },
    ];

    lines.sort((a, b) => a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' }));

    expect(lines.map((l) => l.productName)).toEqual([
      'Aceite de Maíz',
      'Árbol de Té',
      'Arroz Blanco',
      'Zanahorias 1kg',
    ]);
  });
});
