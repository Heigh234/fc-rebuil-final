import { createServiceRoleClient } from '@/lib/supabase/server';
import { jsonSuccess, handleApiError } from '@/lib/api/http-error';
import type { CatalogProductDto } from '@/types/contracts';
import {
  fetchAllUploadPricesWithProducts,
  resolvePreviousPricesMap,
  POSTGREST_PAGE_SIZE,
} from '@/lib/supabase/catalog-queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    // 1. Limpieza de cargas pendientes expiradas
    await supabase.rpc('expire_stale_pending_uploads');

    // 2. Consultar configuración activa
    const { data: settings, error: settingsError } = await supabase
      .from('workspace_settings')
      .select('active_upload_id')
      .eq('singleton_key', true)
      .maybeSingle();

    if (settingsError) {
      throw settingsError;
    }

    if (!settings?.active_upload_id) {
      return jsonSuccess<CatalogProductDto[]>([]);
    }

    // 3. Consultar datos de la carga activa
    const { data: activeUpload, error: activeUploadError } = await supabase
      .from('pdf_uploads')
      .select('id, price_list_date')
      .eq('id', settings.active_upload_id)
      .maybeSingle();

    if (activeUploadError) {
      throw activeUploadError;
    }

    if (!activeUpload || !activeUpload.price_list_date) {
      return jsonSuccess<CatalogProductDto[]>([]);
    }

    // 4. Consultar precios y productos de la carga activa con paginación determinística
    const currentPrices = await fetchAllUploadPricesWithProducts(
      supabase,
      activeUpload.id
    );

    if (!currentPrices || currentPrices.length === 0) {
      return jsonSuccess<CatalogProductDto[]>([]);
    }

    // 5. Consultar productos existentes en Mi tienda (inStore) con paginación determinística
    const storeProductIds = new Set<string>();
    let storeOffset = 0;
    while (true) {
      const { data: storeRows, error: storeError } = await supabase
        .from('store_products')
        .select('product_id')
        .order('id', { ascending: true })
        .range(storeOffset, storeOffset + POSTGREST_PAGE_SIZE - 1);

      if (storeError) {
        throw storeError;
      }

      if (!storeRows || storeRows.length === 0) {
        break;
      }

      for (const sp of storeRows) {
        storeProductIds.add(sp.product_id);
      }

      if (storeRows.length < POSTGREST_PAGE_SIZE) {
        break;
      }

      storeOffset += POSTGREST_PAGE_SIZE;
    }

    // 6. Consultar cargas candidatas para el cálculo de "precio anterior" (Sección 8: L325)
    const previousPriceMap = await resolvePreviousPricesMap(supabase, {
      id: activeUpload.id,
      price_list_date: activeUpload.price_list_date,
    });

    // 7. Construir DTOs del catálogo
    const catalog: CatalogProductDto[] = currentPrices.map((cp) => {
      const prod = Array.isArray(cp.products) ? cp.products[0] : cp.products;
      const previousPrice = previousPriceMap.get(cp.product_id) ?? null;

      return {
        id: prod.id,
        sourceName: prod.source_name,
        displayName: prod.display_name,
        currentPriceBs: Number(cp.box_price_bs),
        previousPriceBs: previousPrice,
        priceListDate: activeUpload.price_list_date,
        inStore: storeProductIds.has(prod.id),
      };
    });

    // 8. Ordenar alfabéticamente por display_name (Sección 17: L747)
    catalog.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'es', { sensitivity: 'base' })
    );

    return jsonSuccess<CatalogProductDto[]>(catalog);
  } catch (error) {
    return handleApiError(error);
  }
}
