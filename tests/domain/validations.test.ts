import { describe, it, expect } from 'vitest';
import {
  storeProductInputSchema,
  shoppingListInputSchema,
  shoppingListItemInputSchema,
  reorderSchema,
} from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';

describe('validations.ts - Esquemas Zod y mensajes de error exactos', () => {
  describe('storeProductInputSchema', () => {
    it('valida exitosamente un producto de tienda correcto', () => {
      const valid = {
        customName: 'Harina PAN Blanca',
        manualPriceBs: 45.5,
        unitsPerBox: 20,
        margins: [0, 15, 25],
      };

      const result = storeProductInputSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('asigna valores por defecto para unitsPerBox (1) y margins ([0])', () => {
      const minimal = {
        customName: 'Arroz Mary',
      };

      const result = storeProductInputSchema.safeParse(minimal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unitsPerBox).toBe(1);
        expect(result.data.margins).toEqual([0]);
      }
    });

    it('falla con mensaje exacto si el nombre está vacío', () => {
      const result = storeProductInputSchema.safeParse({
        customName: '   ',
        margins: [10],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find((i) => i.path.includes('customName'));
        expect(error?.message).toBe(MESSAGES.ERROR_NAME_REQUIRED);
      }
    });

    it('falla con mensaje exacto si el nombre supera los 200 caracteres', () => {
      const result = storeProductInputSchema.safeParse({
        customName: 'a'.repeat(201),
        margins: [10],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find((i) => i.path.includes('customName'));
        expect(error?.message).toBe(MESSAGES.ERROR_NAME_TOO_LONG);
      }
    });

    it('falla con mensaje exacto si el precio manual es cero o negativo', () => {
      const resultZero = storeProductInputSchema.safeParse({
        customName: 'Producto',
        manualPriceBs: 0,
        margins: [10],
      });
      expect(resultZero.success).toBe(false);
      if (!resultZero.success) {
        const error = resultZero.error.issues.find((i) => i.path.includes('manualPriceBs'));
        expect(error?.message).toBe(MESSAGES.ERROR_PRICE_POSITIVE);
      }

      const resultNeg = storeProductInputSchema.safeParse({
        customName: 'Producto',
        manualPriceBs: -5,
        margins: [10],
      });
      expect(resultNeg.success).toBe(false);
      if (!resultNeg.success) {
        const error = resultNeg.error.issues.find((i) => i.path.includes('manualPriceBs'));
        expect(error?.message).toBe(MESSAGES.ERROR_PRICE_POSITIVE);
      }
    });

    it('falla con mensaje exacto si las unidades por caja están fuera de 1..9999', () => {
      const resultZero = storeProductInputSchema.safeParse({
        customName: 'Producto',
        unitsPerBox: 0,
        margins: [10],
      });
      expect(resultZero.success).toBe(false);
      if (!resultZero.success) {
        const error = resultZero.error.issues.find((i) => i.path.includes('unitsPerBox'));
        expect(error?.message).toBe(MESSAGES.ERROR_UNITS_RANGE);
      }

      const resultTooHigh = storeProductInputSchema.safeParse({
        customName: 'Producto',
        unitsPerBox: 10000,
        margins: [10],
      });
      expect(resultTooHigh.success).toBe(false);
      if (!resultTooHigh.success) {
        const error = resultTooHigh.error.issues.find((i) => i.path.includes('unitsPerBox'));
        expect(error?.message).toBe(MESSAGES.ERROR_UNITS_RANGE);
      }
    });

    it('falla con mensaje exacto si algún margen está fuera de 0%..500%', () => {
      const resultNeg = storeProductInputSchema.safeParse({
        customName: 'Producto',
        margins: [-1],
      });
      expect(resultNeg.success).toBe(false);
      if (!resultNeg.success) {
        const error = resultNeg.error.issues.find((i) => i.path.includes('margins'));
        expect(error?.message).toBe(MESSAGES.ERROR_MARGIN_RANGE);
      }

      const resultOver = storeProductInputSchema.safeParse({
        customName: 'Producto',
        margins: [501],
      });
      expect(resultOver.success).toBe(false);
      if (!resultOver.success) {
        const error = resultOver.error.issues.find((i) => i.path.includes('margins'));
        expect(error?.message).toBe(MESSAGES.ERROR_MARGIN_RANGE);
      }
    });

    it('falla con mensaje exacto si se repiten márgenes', () => {
      const result = storeProductInputSchema.safeParse({
        customName: 'Producto',
        margins: [10, 20, 10],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues.find((i) => i.path.includes('margins'));
        expect(error?.message).toBe(MESSAGES.ERROR_MARGIN_DUPLICATE);
      }
    });

    it('falla con mensaje exacto si hay más de 5 márgenes o lista vacía', () => {
      const resultSix = storeProductInputSchema.safeParse({
        customName: 'Producto',
        margins: [0, 10, 20, 30, 40, 50],
      });
      expect(resultSix.success).toBe(false);
      if (!resultSix.success) {
        const error = resultSix.error.issues.find((i) => i.path.includes('margins'));
        expect(error?.message).toBe(MESSAGES.ERROR_MARGIN_MAX);
      }

      const resultEmpty = storeProductInputSchema.safeParse({
        customName: 'Producto',
        margins: [],
      });
      expect(resultEmpty.success).toBe(false);
      if (!resultEmpty.success) {
        const error = resultEmpty.error.issues.find((i) => i.path.includes('margins'));
        expect(error?.message).toBe(MESSAGES.ERROR_MARGIN_MIN);
      }
    });
  });

  describe('shoppingListInputSchema', () => {
    it('valida exitosamente nombres de lista de 1 a 100 caracteres', () => {
      expect(shoppingListInputSchema.safeParse({ name: 'Compra del 16/10/2026' }).success).toBe(true);
      expect(shoppingListInputSchema.safeParse({ name: 'a'.repeat(100) }).success).toBe(true);
    });

    it('falla con nombre vacío o que exceda 100 caracteres', () => {
      expect(shoppingListInputSchema.safeParse({ name: '   ' }).success).toBe(false);
      expect(shoppingListInputSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
    });
  });

  describe('shoppingListItemInputSchema', () => {
    it('valida cantidades en rango 1..9999 y etiquetas VES / USD', () => {
      expect(shoppingListItemInputSchema.safeParse({ quantity: 1, currencyTag: 'VES' }).success).toBe(true);
      expect(shoppingListItemInputSchema.safeParse({ quantity: 9999, currencyTag: 'USD' }).success).toBe(true);
      expect(shoppingListItemInputSchema.safeParse({ quantity: 0 }).success).toBe(false);
      expect(shoppingListItemInputSchema.safeParse({ quantity: 10000 }).success).toBe(false);
      expect(shoppingListItemInputSchema.safeParse({ quantity: 5, currencyTag: 'EUR' as any }).success).toBe(false);
    });
  });

  describe('reorderSchema', () => {
    it('valida listas de identificadores sin duplicados', () => {
      expect(reorderSchema.safeParse({ orderedIds: ['id-1', 'id-2', 'id-3'] }).success).toBe(true);
      expect(reorderSchema.safeParse({ orderedIds: [] }).success).toBe(false);
      expect(reorderSchema.safeParse({ orderedIds: ['id-1', 'id-1'] }).success).toBe(false);
    });
  });
});
