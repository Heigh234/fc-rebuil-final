import type { CurrencyTag, SalePricePreviewDto } from '@/types/contracts';

/**
 * Redondeo comercial a 2 decimales (hacia arriba si el tercer decimal es >= 5).
 * Los cálculos intermedios se conservan con toda la precisión y solo se redondea al final.
 */
export function roundHalfUp2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return sign * (Math.round(abs * 100 + Number.EPSILON) / 100);
}

export interface ResolveStoreProductPricingInput {
  manualPriceBs: number | null | undefined;
  catalogPriceBs: number | null | undefined;
  unitsPerBox: number;
  margins: number[];
}

export interface StoreProductPricingResult {
  baseBoxPriceBs: number | null;
  unitPriceBs: number | null;
  salePrices: SalePricePreviewDto[];
}

/**
 * Calcula precios para un producto de la tienda según las Secciones 9 y 10:
 * - baseBoxPriceBs: precio manual si existe, o precio del catálogo activo si no. Null si ninguno.
 * - unitPriceBs: baseBoxPriceBs / unitsPerBox (redondeado a 2 decimales).
 * - salePrices: precio por unidad con margen aplicado para cada porcentaje (redondeado a 2 decimales).
 */
export function resolveStoreProductPricing(
  input: ResolveStoreProductPricingInput
): StoreProductPricingResult {
  const { manualPriceBs, catalogPriceBs, unitsPerBox, margins } = input;

  const baseBoxPriceBs =
    manualPriceBs != null ? manualPriceBs : (catalogPriceBs ?? null);

  if (baseBoxPriceBs === null) {
    return {
      baseBoxPriceBs: null,
      unitPriceBs: null,
      salePrices: [],
    };
  }

  const units = unitsPerBox > 0 ? unitsPerBox : 1;
  const rawUnitPrice = baseBoxPriceBs / units;
  const unitPriceBs = roundHalfUp2(rawUnitPrice);

  const salePrices: SalePricePreviewDto[] = margins.map((marginPercent) => {
    const salePriceBs = roundHalfUp2(rawUnitPrice * (1 + marginPercent / 100));
    return {
      marginPercent,
      salePriceBs,
    };
  });

  return {
    baseBoxPriceBs,
    unitPriceBs,
    salePrices,
  };
}

export interface ResolveOpenListItemPricingInput {
  isInStore: boolean;
  customName: string | null | undefined;
  manualPriceBs: number | null | undefined;
  catalogDisplayName: string;
  catalogPriceBs: number | null | undefined;
  quantity: number;
  currencyTag: CurrencyTag;
}

export interface OpenListItemPricingResult {
  productName: string;
  boxPriceBs: number | null;
  lineTotalBs: number | null;
}

/**
 * Resuelve el nombre y precio de un ítem en una lista abierta según la Sección 11 (L447-L453):
 * - En tienda: customName (o catalogDisplayName si vacío), manualPriceBs ?? catalogPriceBs.
 * - Fuera de tienda: catalogDisplayName, catalogPriceBs.
 * - Sin precio disponible: boxPriceBs = null, lineTotalBs = null.
 */
export function resolveOpenListItemPricing(
  input: ResolveOpenListItemPricingInput
): OpenListItemPricingResult {
  const {
    isInStore,
    customName,
    manualPriceBs,
    catalogDisplayName,
    catalogPriceBs,
    quantity,
  } = input;

  let productName = catalogDisplayName;
  let boxPriceBs: number | null = null;

  if (isInStore) {
    productName = customName && customName.trim() ? customName.trim() : catalogDisplayName;
    boxPriceBs = manualPriceBs != null ? manualPriceBs : (catalogPriceBs ?? null);
  } else {
    productName = catalogDisplayName;
    boxPriceBs = catalogPriceBs ?? null;
  }

  const lineTotalBs =
    boxPriceBs != null ? roundHalfUp2(quantity * boxPriceBs) : null;

  return {
    productName,
    boxPriceBs,
    lineTotalBs,
  };
}

export interface ListItemForSummary {
  currencyTag: CurrencyTag;
  boxPriceBs: number | null;
  quantity: number;
}

export interface ShoppingListSummaryCalculation {
  totalBs: number;
  itemCount: number;
  usdItemCount: number;
  pricelessItemCount: number;
}

/**
 * Calcula los totales de una lista según la Sección 9 (L378-L385):
 * - Solo las líneas con etiqueta VES y precio se suman al total en bolívares.
 * - Las líneas USD no se suman al total en bolívares.
 * - Las líneas "Sin precio" no se suman.
 * - Si todas las líneas están en USD o la lista está vacía, totalBs es 0.
 */
export function calculateListSummary(
  items: ListItemForSummary[]
): ShoppingListSummaryCalculation {
  let totalBs = 0;
  let usdItemCount = 0;
  let pricelessItemCount = 0;

  for (const item of items) {
    if (item.currencyTag === 'USD') {
      usdItemCount += 1;
    }

    if (item.boxPriceBs === null) {
      pricelessItemCount += 1;
    } else if (item.currencyTag === 'VES') {
      const lineTotal = roundHalfUp2(item.quantity * item.boxPriceBs);
      totalBs += lineTotal;
    }
  }

  return {
    totalBs: roundHalfUp2(totalBs),
    itemCount: items.length,
    usdItemCount,
    pricelessItemCount,
  };
}
