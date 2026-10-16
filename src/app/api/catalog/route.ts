import { createServiceRoleClient } from '@/lib/supabase/server';
import { jsonSuccess, handleApiError } from '@/lib/api/http-error';
import type { CatalogProductDto } from '@/types/contracts';

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

    // 4. Consultar precios y productos de la carga activa
    const { data: currentPrices, error: currentPricesError } = await supabase
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
      .eq('upload_id', activeUpload.id);

    if (currentPricesError) {
      throw currentPricesError;
    }

    if (!currentPrices || currentPrices.length === 0) {
      return jsonSuccess<CatalogProductDto[]>([]);
    }

    // 5. Consultar productos existentes en Mi tienda (inStore)
    const { data: storeProducts, error: storeError } = await supabase
      .from('store_products')
      .select('product_id');

    if (storeError) {
      throw storeError;
    }

    const storeProductIds = new Set((storeProducts ?? []).map((sp) => sp.product_id));

    // 6. Consultar cargas candidatas para el cálculo de "precio anterior" (Sección 8: L325)
    // Cargas distintas de la activa, aplicadas o no aplicadas, con fecha <= fecha activa,
    // ordenadas por fecha de lista DESC y created_at DESC (desempate de subida más reciente).
    const { data: candidateUploads, error: candidatesError } = await supabase
      .from('pdf_uploads')
      .select('id, price_list_date, created_at')
      .in('status', ['applied', 'not_applied'])
      .neq('id', activeUpload.id)
      .lte('price_list_date', activeUpload.price_list_date)
      .order('price_list_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (candidatesError) {
      throw candidatesError;
    }

    const previousPriceMap = new Map<string, number>();

    if (candidateUploads && candidateUploads.length > 0) {
      const candidateUploadIds = candidateUploads.map((u) => u.id);
      const uploadRankMap = new Map<string, number>();
      candidateUploadIds.forEach((id, index) => uploadRankMap.set(id, index));

      const productIds = currentPrices.map((cp) => cp.product_id);

      const { data: historicalPrices, error: histError } = await supabase
        .from('product_prices')
        .select('product_id, upload_id, box_price_bs')
        .in('product_id', productIds)
        .in('upload_id', candidateUploadIds);

      if (histError) {
        throw histError;
      }

      // Para cada producto, conservar el precio de la carga candidata de mayor prioridad (menor rank)
      const bestRankByProduct = new Map<string, number>();

      for (const hp of historicalPrices ?? []) {
        const rank = uploadRankMap.get(hp.upload_id);
        if (rank === undefined) continue;

        const currentBestRank = bestRankByProduct.get(hp.product_id);
        if (currentBestRank === undefined || rank < currentBestRank) {
          bestRankByProduct.set(hp.product_id, rank);
          previousPriceMap.set(hp.product_id, Number(hp.box_price_bs));
        }
      }
    }

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
