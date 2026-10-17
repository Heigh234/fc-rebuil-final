import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAllUploadPricesWithProducts,
  fetchUploadPricesMap,
  resolvePreviousPricesMap,
  POSTGREST_PAGE_SIZE,
  POSTGREST_IN_CHUNK_SIZE,
} from '@/lib/supabase/catalog-queries';
import type { StoreProductDto } from '@/types/contracts';

interface MockQueryState {
  table: string;
  selectColumns: string;
  eqFilters: Record<string, unknown>;
  inFilters: Record<string, unknown[]>;
  neqFilters: Record<string, unknown>;
  lteFilters: Record<string, unknown>;
  orders: { col: string; opts?: { ascending?: boolean } }[];
  rangeFrom: number | null;
  rangeTo: number | null;
  limitVal: number | null;
}

function createMockSupabase(handlers: {
  onSelectProductPrices?: (state: MockQueryState) => { data: unknown[]; error: unknown };
  onSelectPdfUploads?: (state: MockQueryState) => { data: unknown[]; error: unknown };
}) {
  return {
    from: vi.fn((table: string) => {
      const state: MockQueryState = {
        table,
        selectColumns: '',
        eqFilters: {},
        inFilters: {},
        neqFilters: {},
        lteFilters: {},
        orders: [],
        rangeFrom: null,
        rangeTo: null,
        limitVal: null,
      };

      const chain: Record<string, unknown> = {
        select: vi.fn((cols: string) => {
          state.selectColumns = cols;
          return chain;
        }),
        eq: vi.fn((col: string, val: unknown) => {
          state.eqFilters[col] = val;
          return chain;
        }),
        neq: vi.fn((col: string, val: unknown) => {
          state.neqFilters[col] = val;
          return chain;
        }),
        in: vi.fn((col: string, val: unknown[]) => {
          state.inFilters[col] = val;
          return chain;
        }),
        lte: vi.fn((col: string, val: unknown) => {
          state.lteFilters[col] = val;
          return chain;
        }),
        order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
          state.orders.push({ col, opts });
          return chain;
        }),
        range: vi.fn((from: number, to: number) => {
          state.rangeFrom = from;
          state.rangeTo = to;
          return chain;
        }),
        limit: vi.fn((limit: number) => {
          state.limitVal = limit;
          return chain;
        }),
        then: (
          resolve: (res: { data: unknown[]; error: unknown }) => void,
          reject: (err: unknown) => void
        ) => {
          let result = { data: [] as unknown[], error: null as unknown };
          if (table === 'product_prices' && handlers.onSelectProductPrices) {
            result = handlers.onSelectProductPrices(state);
          } else if (table === 'pdf_uploads' && handlers.onSelectPdfUploads) {
            result = handlers.onSelectPdfUploads(state);
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };

      return chain;
    }),
  } as unknown as SupabaseClient;
}

describe('MOD-M01: PostgREST Range Pagination & Previous Price Resolution', () => {
  describe('fetchAllUploadPricesWithProducts (superando el límite de 1.000 filas)', () => {
    it('realiza paginación por rangos de 1.000 filas y recupera las 1.183 filas completas sin truncar', async () => {
      // Simular base de datos con 1.183 productos (como 10-10-26.pdf)
      const totalRows = 1183;
      const mockDatabaseRows = Array.from({ length: totalRows }, (_, i) => ({
        product_id: `prod-uuid-${String(i + 1).padStart(4, '0')}`,
        box_price_bs: 100 + i,
        products: {
          id: `prod-uuid-${String(i + 1).padStart(4, '0')}`,
          source_name: `producto ${i + 1}`,
          display_name:
            i === 999
              ? 'Rosal Toallin Unidad Duo 160 H'
              : i === 1182
              ? 'Yogurt Griego Yoka De Fresa 150g (unidad)'
              : `Producto ${i + 1}`,
        },
      }));

      const rangesQueried: { from: number; to: number }[] = [];

      const mockSupabase = createMockSupabase({
        onSelectProductPrices: (state) => {
          expect(state.eqFilters['upload_id']).toBe('upload-active-1183');
          expect(state.orders).toEqual([{ col: 'product_id', opts: { ascending: true } }]);

          const from = state.rangeFrom ?? 0;
          const to = state.rangeTo ?? (from + POSTGREST_PAGE_SIZE - 1);
          rangesQueried.push({ from, to });

          // Simula el corte de servidor: devuelve el slice [from, to + 1]
          const slice = mockDatabaseRows.slice(from, to + 1);
          return { data: slice, error: null };
        },
      });

      const result = await fetchAllUploadPricesWithProducts(mockSupabase, 'upload-active-1183');

      // Debe consultar exactamente 2 páginas: 0..999 y 1000..1999
      expect(rangesQueried).toEqual([
        { from: 0, to: 999 },
        { from: 1000, to: 1999 },
      ]);

      // Debe retornar las 1.183 filas completas
      expect(result).toHaveLength(1183);

      // Fila 1000 (#1.000, que antes se cortaba)
      const row1000 = result[999];
      const prod1000 = Array.isArray(row1000.products) ? row1000.products[0] : row1000.products;
      expect(prod1000.display_name).toBe('Rosal Toallin Unidad Duo 160 H');

      // Fila 1183 (#1.183, última fila de la lista)
      const row1183 = result[1182];
      const prod1183 = Array.isArray(row1183.products) ? row1183.products[0] : row1183.products;
      expect(prod1183.display_name).toBe('Yogurt Griego Yoka De Fresa 150g (unidad)');
    });

    it('retorna arreglo vacío si la carga no contiene productos', async () => {
      const mockSupabase = createMockSupabase({
        onSelectProductPrices: () => ({ data: [], error: null }),
      });

      const result = await fetchAllUploadPricesWithProducts(mockSupabase, 'upload-empty');
      expect(result).toEqual([]);
    });
  });

  describe('fetchUploadPricesMap (lotes <= 200 y paginación)', () => {
    it('cuando recibe productIds (>200 items), divide en lotes de <= 200 UUIDs', async () => {
      const requestedIds = Array.from({ length: 450 }, (_, i) => `id-${i + 1}`);
      const chunkSizes: number[] = [];

      const mockSupabase = createMockSupabase({
        onSelectProductPrices: (state) => {
          const chunk = state.inFilters['product_id'] as string[];
          chunkSizes.push(chunk.length);
          const data = chunk.map((id) => ({
            product_id: id,
            box_price_bs: 50.5,
          }));
          return { data, error: null };
        },
      });

      const priceMap = await fetchUploadPricesMap(mockSupabase, 'upload-1', requestedIds);

      // 450 ids divididos en lotes de <= 200: 200 + 200 + 50 = 3 consultas
      expect(chunkSizes).toEqual([200, 200, 50]);
      expect(priceMap.size).toBe(450);
      expect(priceMap.get('id-1')).toBe(50.5);
      expect(priceMap.get('id-450')).toBe(50.5);
    });

    it('cuando recibe productIds vacío, retorna mapa vacío sin consultar la BD', async () => {
      const mockSupabase = createMockSupabase({
        onSelectProductPrices: () => {
          throw new Error('No debería consultar la BD para lista vacía');
        },
      });

      const priceMap = await fetchUploadPricesMap(mockSupabase, 'upload-1', []);
      expect(priceMap.size).toBe(0);
    });

    it('cuando NO recibe productIds, pagina toda la carga con .range()', async () => {
      const rangesQueried: { from: number; to: number }[] = [];

      const mockSupabase = createMockSupabase({
        onSelectProductPrices: (state) => {
          const from = state.rangeFrom ?? 0;
          const to = state.rangeTo ?? (from + POSTGREST_PAGE_SIZE - 1);
          rangesQueried.push({ from, to });

          if (from === 0) {
            const data = Array.from({ length: 1000 }, (_, i) => ({
              product_id: `prod-${i}`,
              box_price_bs: 10,
            }));
            return { data, error: null };
          } else {
            const data = Array.from({ length: 150 }, (_, i) => ({
              product_id: `prod-${1000 + i}`,
              box_price_bs: 20,
            }));
            return { data, error: null };
          }
        },
      });

      const priceMap = await fetchUploadPricesMap(mockSupabase, 'upload-all');
      expect(rangesQueried).toEqual([
        { from: 0, to: 999 },
        { from: 1000, to: 1999 },
      ]);
      expect(priceMap.size).toBe(1150);
      expect(priceMap.get('prod-0')).toBe(10);
      expect(priceMap.get('prod-1050')).toBe(20);
    });
  });

  describe('resolvePreviousPricesMap (resolución cronológica de precio anterior)', () => {
    const activeUpload = {
      id: 'upload-active',
      price_list_date: '2026-10-15',
    };

    it('identifica la carga candidata de mayor prioridad y resuelve el precio anterior por producto', async () => {
      const candidateUploads = [
        { id: 'u-cand-1', price_list_date: '2026-10-14', created_at: '2026-10-14T10:00:00Z', status: 'not_applied' },
        { id: 'u-cand-2', price_list_date: '2026-10-10', created_at: '2026-10-10T10:00:00Z', status: 'applied' },
      ];

      const historicalPrices = [
        // Producto 1 está en la candidata 1 y 2 -> Debe ganar candidata 1 (2026-10-14)
        { upload_id: 'u-cand-1', product_id: 'p-1', box_price_bs: 120 },
        { upload_id: 'u-cand-2', product_id: 'p-1', box_price_bs: 110 },
        // Producto 2 solo está en la candidata 2 (2026-10-10) -> Debe resolver candidata 2
        { upload_id: 'u-cand-2', product_id: 'p-2', box_price_bs: 85 },
      ];

      const mockSupabase = createMockSupabase({
        onSelectPdfUploads: () => ({ data: candidateUploads, error: null }),
        onSelectProductPrices: () => ({ data: historicalPrices, error: null }),
      });

      const prevPrices = await resolvePreviousPricesMap(mockSupabase, activeUpload);

      expect(prevPrices.get('p-1')).toBe(120);
      expect(prevPrices.get('p-2')).toBe(85);
      expect(prevPrices.get('p-nonexistent')).toBeUndefined();
    });

    it('soporta filtrado optimizado por lotes de productIds para /api/store', async () => {
      const candidateUploads = [
        { id: 'u-cand-1', price_list_date: '2026-10-12', created_at: '2026-10-12T10:00:00Z', status: 'applied' },
      ];

      const productIdsFilter: string[][] = [];

      const mockSupabase = createMockSupabase({
        onSelectPdfUploads: () => ({ data: candidateUploads, error: null }),
        onSelectProductPrices: (state) => {
          const chunk = state.inFilters['product_id'] as string[];
          productIdsFilter.push(chunk);
          return {
            data: chunk.map((id) => ({
              upload_id: 'u-cand-1',
              product_id: id,
              box_price_bs: 99.99,
            })),
            error: null,
          };
        },
      });

      const storeProductIds = ['sp-1', 'sp-2', 'sp-3'];
      const prevPrices = await resolvePreviousPricesMap(mockSupabase, activeUpload, storeProductIds);

      expect(productIdsFilter).toEqual([['sp-1', 'sp-2', 'sp-3']]);
      expect(prevPrices.get('sp-1')).toBe(99.99);
      expect(prevPrices.get('sp-2')).toBe(99.99);
      expect(prevPrices.get('sp-3')).toBe(99.99);
    });

    it('retorna mapa vacío si no existen cargas candidatas elegibles', async () => {
      const mockSupabase = createMockSupabase({
        onSelectPdfUploads: () => ({ data: [], error: null }),
      });

      const prevPrices = await resolvePreviousPricesMap(mockSupabase, activeUpload);
      expect(prevPrices.size).toBe(0);
    });
  });

  describe('StoreProductDto y variación de precio para Mi Tienda (CONT-M01)', () => {
    it('StoreProductDto contiene previousPriceBs y permite identificar variaciones de precio', () => {
      const storeItemWithPriceIncrease: StoreProductDto = {
        id: 'sp-item-1',
        productId: 'prod-1',
        catalogDisplayName: 'Arroz 1kg',
        customName: 'Arroz Blanco',
        manualPriceBs: null,
        unitsPerBox: 24,
        margins: [20],
        position: 0,
        baseBoxPriceBs: 150,
        previousPriceBs: 120, // Subió de 120 a 150 (rojo)
        unitPriceBs: 6.25,
        salePrices: [{ marginPercent: 20, salePriceBs: 7.5 }],
      };

      const isPriceUp =
        storeItemWithPriceIncrease.baseBoxPriceBs !== null &&
        storeItemWithPriceIncrease.previousPriceBs !== null &&
        storeItemWithPriceIncrease.baseBoxPriceBs > storeItemWithPriceIncrease.previousPriceBs;

      const isPriceDown =
        storeItemWithPriceIncrease.baseBoxPriceBs !== null &&
        storeItemWithPriceIncrease.previousPriceBs !== null &&
        storeItemWithPriceIncrease.baseBoxPriceBs < storeItemWithPriceIncrease.previousPriceBs;

      expect(isPriceUp).toBe(true);
      expect(isPriceDown).toBe(false);

      const storeItemWithPriceDecrease: StoreProductDto = {
        ...storeItemWithPriceIncrease,
        baseBoxPriceBs: 110,
        previousPriceBs: 120, // Bajó de 120 a 110 (verde)
      };

      expect(
        storeItemWithPriceDecrease.baseBoxPriceBs! < storeItemWithPriceDecrease.previousPriceBs!
      ).toBe(true);

      const storeItemWithoutPreviousPrice: StoreProductDto = {
        ...storeItemWithPriceIncrease,
        previousPriceBs: null,
      };

      const hasVariation =
        storeItemWithoutPreviousPrice.baseBoxPriceBs !== null &&
        storeItemWithoutPreviousPrice.previousPriceBs !== null;

      expect(hasVariation).toBe(false);
    });
  });
});
