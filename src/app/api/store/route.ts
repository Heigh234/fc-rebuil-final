import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonSuccess,
  jsonCreated,
  notFound,
  conflict,
  handleApiError,
} from '@/lib/api/http-error';
import { resolveStoreProductPricing } from '@/lib/domain/pricing';
import { createStoreProductSchema } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  fetchUploadPricesMap,
  resolvePreviousPricesMap,
} from '@/lib/supabase/catalog-queries';
import type { StoreProductDto } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    // 1. Obtener la carga activa vigente
    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('active_upload_id')
      .eq('singleton_key', true)
      .maybeSingle();

    let activeUpload: { id: string; price_list_date: string } | null = null;
    if (settings?.active_upload_id) {
      const { data: uploadData } = await supabase
        .from('pdf_uploads')
        .select('id, price_list_date')
        .eq('id', settings.active_upload_id)
        .maybeSingle();

      if (uploadData && uploadData.price_list_date) {
        activeUpload = {
          id: uploadData.id,
          price_list_date: uploadData.price_list_date,
        };
      }
    }

    // 2. Obtener los productos de Mi tienda ordenados por position ASC y created_at ASC
    const { data: storeRows, error: storeError } = await supabase
      .from('store_products')
      .select(`
        id,
        product_id,
        custom_name,
        manual_price_bs,
        units_per_box,
        margins,
        position,
        products!inner (
          id,
          display_name,
          source_name
        )
      `)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (storeError) {
      throw storeError;
    }

    if (!storeRows || storeRows.length === 0) {
      return jsonSuccess<StoreProductDto[]>([]);
    }

    // 3. Obtener precios del catálogo activo y precio anterior para los productos en la tienda
    const productIds = storeRows.map((r) => r.product_id);
    let priceMap = new Map<string, number>();
    let previousPriceMap = new Map<string, number>();

    if (activeUpload) {
      priceMap = await fetchUploadPricesMap(supabase, activeUpload.id, productIds);
      previousPriceMap = await resolvePreviousPricesMap(
        supabase,
        activeUpload,
        productIds
      );
    }

    // 4. Mapear y calcular precios dinámicos (precio base, precio unitario y márgenes)
    const list: StoreProductDto[] = storeRows.map((r) => {
      const prod = Array.isArray(r.products) ? r.products[0] : r.products;
      const catalogPriceBs = priceMap.get(r.product_id) ?? null;

      const parsedMargins: number[] = Array.isArray(r.margins)
        ? (r.margins as number[])
        : typeof r.margins === 'string'
        ? JSON.parse(r.margins)
        : [0];

      const pricing = resolveStoreProductPricing({
        manualPriceBs: r.manual_price_bs != null ? Number(r.manual_price_bs) : null,
        catalogPriceBs,
        unitsPerBox: Number(r.units_per_box ?? 1),
        margins: parsedMargins,
      });

      return {
        id: r.id,
        productId: r.product_id,
        catalogDisplayName: prod.display_name,
        customName: r.custom_name,
        manualPriceBs: r.manual_price_bs != null ? Number(r.manual_price_bs) : null,
        unitsPerBox: Number(r.units_per_box ?? 1),
        margins: parsedMargins,
        position: Number(r.position),
        baseBoxPriceBs: pricing.baseBoxPriceBs,
        previousPriceBs: previousPriceMap.get(r.product_id) ?? null,
        unitPriceBs: pricing.unitPriceBs,
        salePrices: pricing.salePrices,
      };
    });

    return jsonSuccess<StoreProductDto[]>(list);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = createStoreProductSchema.safeParse(rawBody);

    if (!parsed.success) {
      return handleApiError(parsed.error);
    }

    const { productId, customName, manualPriceBs, unitsPerBox, margins } = parsed.data;
    const supabase = createServiceRoleClient();

    // 1. Verificar existencia del producto base en products
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('id, display_name')
      .eq('id', productId)
      .maybeSingle();

    if (prodError || !product) {
      return notFound('Producto no encontrado.');
    }

    // 2. Verificar que no esté ya en la tienda (unicidad)
    const { data: existing } = await supabase
      .from('store_products')
      .select('id')
      .eq('product_id', productId)
      .maybeSingle();

    if (existing) {
      return conflict(MESSAGES.PRODUCT_ALREADY_IN_STORE);
    }

    // 3. Asignar posición al final
    const { data: maxPosRow } = await supabase
      .from('store_products')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = maxPosRow && maxPosRow.position != null ? maxPosRow.position + 1 : 0;
    const finalCustomName = customName && customName.trim() ? customName.trim() : product.display_name;

    // 4. Insertar en store_products
    const { data: inserted, error: insertError } = await supabase
      .from('store_products')
      .insert({
        product_id: productId,
        custom_name: finalCustomName,
        manual_price_bs: manualPriceBs ?? null,
        units_per_box: unitsPerBox,
        margins,
        position: nextPosition,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      throw insertError;
    }

    // 5. Consultar precio en carga activa y carga anterior para respuesta inmediata
    let catalogPriceBs: number | null = null;
    let previousPriceBs: number | null = null;

    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('active_upload_id')
      .eq('singleton_key', true)
      .maybeSingle();

    if (settings?.active_upload_id) {
      const { data: activeUpload } = await supabase
        .from('pdf_uploads')
        .select('id, price_list_date')
        .eq('id', settings.active_upload_id)
        .maybeSingle();

      if (activeUpload && activeUpload.price_list_date) {
        const priceMap = await fetchUploadPricesMap(supabase, activeUpload.id, [productId]);
        catalogPriceBs = priceMap.get(productId) ?? null;

        const prevMap = await resolvePreviousPricesMap(
          supabase,
          { id: activeUpload.id, price_list_date: activeUpload.price_list_date },
          [productId]
        );
        previousPriceBs = prevMap.get(productId) ?? null;
      }
    }

    const pricing = resolveStoreProductPricing({
      manualPriceBs: inserted.manual_price_bs != null ? Number(inserted.manual_price_bs) : null,
      catalogPriceBs,
      unitsPerBox: Number(inserted.units_per_box),
      margins,
    });

    const responseDto: StoreProductDto = {
      id: inserted.id,
      productId: inserted.product_id,
      catalogDisplayName: product.display_name,
      customName: inserted.custom_name,
      manualPriceBs: inserted.manual_price_bs != null ? Number(inserted.manual_price_bs) : null,
      unitsPerBox: Number(inserted.units_per_box),
      margins,
      position: Number(inserted.position),
      baseBoxPriceBs: pricing.baseBoxPriceBs,
      previousPriceBs,
      unitPriceBs: pricing.unitPriceBs,
      salePrices: pricing.salePrices,
    };

    return jsonCreated<StoreProductDto>(responseDto);
  } catch (error) {
    return handleApiError(error);
  }
}
