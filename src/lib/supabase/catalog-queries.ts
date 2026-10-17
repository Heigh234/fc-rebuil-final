import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export const POSTGREST_PAGE_SIZE = 1000;
export const POSTGREST_IN_CHUNK_SIZE = 200;

export interface ActiveUploadRef {
  id: string;
  price_list_date: string;
}

export interface RawCatalogPriceRow {
  product_id: string;
  box_price_bs: number | string;
  products:
    | { id: string; source_name: string; display_name: string }
    | { id: string; source_name: string; display_name: string }[];
}

/**
 * Consulta todas las filas de precios y productos para una carga activa,
 * paginando determinísticamente con `.range()` para superar el límite
 * duro de servidor `db-max-rows = 1000` de PostgREST en Supabase.
 */
export async function fetchAllUploadPricesWithProducts(
  supabase: SupabaseClient,
  uploadId: string
): Promise<RawCatalogPriceRow[]> {
  const allRows: RawCatalogPriceRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('product_prices')
      .select(`
        product_id,
        box_price_bs,
        products!inner (
          id,
          source_name,
          display_name
        )
      `)
      .eq('upload_id', uploadId)
      .order('product_id', { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...(data as unknown as RawCatalogPriceRow[]));

    if (data.length < POSTGREST_PAGE_SIZE) {
      break;
    }

    offset += POSTGREST_PAGE_SIZE;
  }

  return allRows;
}

/**
 * Consulta un mapa de precios (product_id -> box_price_bs) para una carga determinada.
 * Si se especifica `productIds`, consulta en lotes seguros (<= 200 UUIDs) para evitar
 * el error 414 URI Too Long. Si no se especifica, pagina con `.range()`.
 */
export async function fetchUploadPricesMap(
  supabase: SupabaseClient,
  uploadId: string,
  productIds?: string[]
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  if (productIds !== undefined) {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return priceMap;
    }

    for (let i = 0; i < uniqueIds.length; i += POSTGREST_IN_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + POSTGREST_IN_CHUNK_SIZE);
      const { data, error } = await supabase
        .from('product_prices')
        .select('product_id, box_price_bs')
        .eq('upload_id', uploadId)
        .in('product_id', chunk);

      if (error) {
        throw error;
      }

      for (const row of data ?? []) {
        priceMap.set(row.product_id, Number(row.box_price_bs));
      }
    }

    return priceMap;
  }

  // Si no se pasaron productIds, paginar toda la carga
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('product_prices')
      .select('product_id, box_price_bs')
      .eq('upload_id', uploadId)
      .order('product_id', { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      priceMap.set(row.product_id, Number(row.box_price_bs));
    }

    if (data.length < POSTGREST_PAGE_SIZE) {
      break;
    }

    offset += POSTGREST_PAGE_SIZE;
  }

  return priceMap;
}

/**
 * Resuelve el mapa de "precio anterior" según la regla cronológica de la
 * Sección 8 (L325) de BODEGA_FC_ESPECIFICACION_RECONSTRUCCION.md:
 * Cargas candidatas con status IN ('applied', 'not_applied'), id != activeUpload.id,
 * price_list_date <= activeUpload.price_list_date, ordenadas por fecha DESC y created_at DESC.
 * Si se especifica `productIds`, optimiza consultando en lotes seguros.
 */
export async function resolvePreviousPricesMap(
  supabase: SupabaseClient,
  activeUpload: ActiveUploadRef,
  productIds?: string[]
): Promise<Map<string, number>> {
  const previousPriceMap = new Map<string, number>();

  // 1. Consultar cargas candidatas
  const { data: candidateUploads, error: candidatesError } = await supabase
    .from('pdf_uploads')
    .select('id, price_list_date, created_at')
    .in('status', ['applied', 'not_applied'])
    .neq('id', activeUpload.id)
    .lte('price_list_date', activeUpload.price_list_date)
    .order('price_list_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);

  if (candidatesError) {
    throw candidatesError;
  }

  if (!candidateUploads || candidateUploads.length === 0) {
    return previousPriceMap;
  }

  const candidateUploadIds = candidateUploads.map((u) => u.id);
  const uploadRankMap = new Map<string, number>();
  candidateUploadIds.forEach((id, index) => uploadRankMap.set(id, index));

  const bestRankByProduct = new Map<string, number>();

  // 2. Si se especifican productIds (caso /api/store)
  if (productIds !== undefined) {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return previousPriceMap;
    }

    for (let i = 0; i < uniqueIds.length; i += POSTGREST_IN_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + POSTGREST_IN_CHUNK_SIZE);
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .from('product_prices')
          .select('product_id, upload_id, box_price_bs')
          .in('upload_id', candidateUploadIds)
          .in('product_id', chunk)
          .order('upload_id', { ascending: true })
          .order('product_id', { ascending: true })
          .range(offset, offset + POSTGREST_PAGE_SIZE - 1);

        if (error) {
          throw error;
        }

        if (!data || data.length === 0) {
          break;
        }

        for (const hp of data) {
          const rank = uploadRankMap.get(hp.upload_id);
          if (rank === undefined) continue;

          const currentBestRank = bestRankByProduct.get(hp.product_id);
          if (currentBestRank === undefined || rank < currentBestRank) {
            bestRankByProduct.set(hp.product_id, rank);
            previousPriceMap.set(hp.product_id, Number(hp.box_price_bs));
          }
        }

        if (data.length < POSTGREST_PAGE_SIZE) {
          break;
        }

        offset += POSTGREST_PAGE_SIZE;
      }
    }

    return previousPriceMap;
  }

  // 3. Si no se especifican productIds (caso /api/catalog): paginar todas las cargas candidatas
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('product_prices')
      .select('product_id, upload_id, box_price_bs')
      .in('upload_id', candidateUploadIds)
      .order('upload_id', { ascending: true })
      .order('product_id', { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const hp of data) {
      const rank = uploadRankMap.get(hp.upload_id);
      if (rank === undefined) continue;

      const currentBestRank = bestRankByProduct.get(hp.product_id);
      if (currentBestRank === undefined || rank < currentBestRank) {
        bestRankByProduct.set(hp.product_id, rank);
        previousPriceMap.set(hp.product_id, Number(hp.box_price_bs));
      }
    }

    if (data.length < POSTGREST_PAGE_SIZE) {
      break;
    }

    offset += POSTGREST_PAGE_SIZE;
  }

  return previousPriceMap;
}
