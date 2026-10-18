import { z } from 'zod';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Esquema de validación para un producto de la tienda (Mi tienda).
 * Aplica los mensajes exactos de la Sección 18 (L877-L884) y reglas de la Sección 19:
 * - Nombre: 1 a 200 caracteres.
 * - Precio manual: opcional, > 0.
 * - Unidades por caja: entero entre 1 y 9999 (default 1).
 * - Márgenes: entre 1 y 5 valores, cada uno entre 0% y 500%, sin duplicados (default [0]).
 */
export const storeProductInputSchema = z.object({
  customName: z
    .string(MESSAGES.ERROR_NAME_REQUIRED)
    .trim()
    .min(1, MESSAGES.ERROR_NAME_REQUIRED)
    .max(200, MESSAGES.ERROR_NAME_TOO_LONG),

  manualPriceBs: z
    .number()
    .gt(0, MESSAGES.ERROR_PRICE_POSITIVE)
    .nullable()
    .optional(),

  unitsPerBox: z
    .number(MESSAGES.ERROR_UNITS_RANGE)
    .int(MESSAGES.ERROR_UNITS_RANGE)
    .min(1, MESSAGES.ERROR_UNITS_RANGE)
    .max(9999, MESSAGES.ERROR_UNITS_RANGE)
    .default(1),

  margins: z
    .array(
      z
        .number()
        .min(0, MESSAGES.ERROR_MARGIN_RANGE)
        .max(500, MESSAGES.ERROR_MARGIN_RANGE)
    )
    .min(1, MESSAGES.ERROR_MARGIN_MIN)
    .max(5, MESSAGES.ERROR_MARGIN_MAX)
    .refine((items) => new Set(items).size === items.length, {
      message: MESSAGES.ERROR_MARGIN_DUPLICATE,
    })
    .default([0]),
});

export type StoreProductInput = z.infer<typeof storeProductInputSchema>;

/**
 * Esquema para agregar un producto del catálogo a Mi tienda.
 */
export const createStoreProductSchema = z.object({
  productId: z.string().min(1, 'El identificador del producto es obligatorio.'),
  customName: z
    .string()
    .trim()
    .min(1, MESSAGES.ERROR_NAME_REQUIRED)
    .max(200, MESSAGES.ERROR_NAME_TOO_LONG)
    .optional(),
  manualPriceBs: z
    .number()
    .gt(0, MESSAGES.ERROR_PRICE_POSITIVE)
    .nullable()
    .optional(),
  unitsPerBox: z
    .number()
    .int(MESSAGES.ERROR_UNITS_RANGE)
    .min(1, MESSAGES.ERROR_UNITS_RANGE)
    .max(9999, MESSAGES.ERROR_UNITS_RANGE)
    .default(1),
  margins: z
    .array(
      z
        .number()
        .min(0, MESSAGES.ERROR_MARGIN_RANGE)
        .max(500, MESSAGES.ERROR_MARGIN_RANGE)
    )
    .min(1, MESSAGES.ERROR_MARGIN_MIN)
    .max(5, MESSAGES.ERROR_MARGIN_MAX)
    .refine((items) => new Set(items).size === items.length, {
      message: MESSAGES.ERROR_MARGIN_DUPLICATE,
    })
    .default([0]),
});

export type CreateStoreProductInput = z.infer<typeof createStoreProductSchema>;

/**
 * Esquema de creación / edición de lista de compras (Sección 19).
 * El nombre debe tener entre 1 y 100 caracteres.
 */
export const shoppingListInputSchema = z.object({
  name: z
    .string(MESSAGES.ERROR_NAME_REQUIRED)
    .trim()
    .min(1, MESSAGES.ERROR_NAME_REQUIRED)
    .max(100, 'El nombre no puede pasar de 100 caracteres.'),
});

export type ShoppingListInput = z.infer<typeof shoppingListInputSchema>;

/**
 * Esquema para agregar o editar un producto dentro de una lista de compras.
 * - Cantidad: entero de 1 a 9999 (Sección 19: L987).
 * - Etiqueta de moneda: 'VES' o 'USD' (Sección 19: L991, default 'VES').
 */
export const shoppingListItemInputSchema = z.object({
  quantity: z
    .number('Las cantidades estén entre 1 y 9999.')
    .int('Las cantidades estén entre 1 y 9999.')
    .min(1, 'Las cantidades estén entre 1 y 9999.')
    .max(9999, 'Las cantidades estén entre 1 y 9999.')
    .default(1),
  currencyTag: z.enum(['VES', 'USD']).default('VES'),
});

export type ShoppingListItemInput = z.infer<typeof shoppingListItemInputSchema>;

/**
 * Esquema para agregar un producto a una lista desde la hoja inferior.
 */
export const addProductToListSchema = z.object({
  listId: z.string().min(1, 'El identificador de la lista es obligatorio.'),
  productId: z.string().min(1, 'El identificador del producto es obligatorio.'),
  quantity: z
    .number()
    .int('Las cantidades estén entre 1 y 9999.')
    .min(1, 'Las cantidades estén entre 1 y 9999.')
    .max(9999, 'Las cantidades estén entre 1 y 9999.')
    .default(1),
  currencyTag: z.enum(['VES', 'USD']).default('VES'),
});

export type AddProductToListInput = z.infer<typeof addProductToListSchema>;

/**
 * Esquema de reordenamiento todo-o-nada (Secciones 10 y 11).
 * Debe ser un arreglo no vacío de identificadores únicos.
 */
export const reorderSchema = z.object({
  orderedIds: z
    .array(z.string().min(1))
    .min(1, 'La lista de identificadores no puede estar vacía.')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'La lista de identificadores contiene duplicados.',
    }),
});

export type ReorderInput = z.infer<typeof reorderSchema>;

/**
 * Expresión regular y validador de formato UUID v4 / estándar (CONT-REM-02).
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

