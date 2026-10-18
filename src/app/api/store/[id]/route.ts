import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonSuccess,
  notFound,
  handleApiError,
} from '@/lib/api/http-error';
import { resolveStoreProductPricing } from '@/lib/domain/pricing';
import { storeProductInputSchema, isValidUuid } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  fetchUploadPricesMap,
  resolvePreviousPricesMap,
} from '@/lib/supabase/catalog-queries';
import type { StoreProductDto } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!isValidUuid(id)) {
      return notFound(MESSAGES.PRODUCT_NOT_IN_STORE);
    }

    const rawBody = await request.json().catch(() => null);

    // Permitir actualización parcial
    const partialSchema = storeProductInputSchema.partial();
    const parsed = partialSchema.safeParse(rawBody);

    if (!parsed.success) {
      return handleApiError(parsed.error);
    }

    const updates = parsed.data;
    const supabase = createServiceRoleClient();

    // 1. Verificar si el producto de la tienda existe (por id de store_products o product_id)
    const { data: existing, error: existError } = await supabase
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
          display_name
        )
      `)
      .or(`id.eq.${id},product_id.eq.${id}`)
      .maybeSingle();

    if (existError || !existing) {
      return notFound(MESSAGES.PRODUCT_NOT_IN_STORE);
    }

    // 2. Preparar campos a actualizar
    const payloadToUpdate: Record<string, unknown> = {};

    if (updates.customName !== undefined) {
      payloadToUpdate.custom_name = updates.customName.trim();
    }
    if (updates.manualPriceBs !== undefined) {
      payloadToUpdate.manual_price_bs = updates.manualPriceBs;
    }
    if (updates.unitsPerBox !== undefined) {
      payloadToUpdate.units_per_box = updates.unitsPerBox;
    }
    if (updates.margins !== undefined) {
      payloadToUpdate.margins = updates.margins;
    }

    let updatedRow = existing;

    if (Object.keys(payloadToUpdate).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from('store_products')
        .update(payloadToUpdate)
        .eq('id', existing.id)
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
            display_name
          )
        `)
        .single();

      if (updateError || !updated) {
        throw updateError;
      }
      updatedRow = updated;
    }

    // 3. Consultar precio de catálogo en la carga activa y carga anterior
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
        const priceMap = await fetchUploadPricesMap(supabase, activeUpload.id, [updatedRow.product_id]);
        catalogPriceBs = priceMap.get(updatedRow.product_id) ?? null;

        const prevMap = await resolvePreviousPricesMap(
          supabase,
          { id: activeUpload.id, price_list_date: activeUpload.price_list_date },
          [updatedRow.product_id]
        );
        previousPriceBs = prevMap.get(updatedRow.product_id) ?? null;
      }
    }

    const prod = Array.isArray(updatedRow.products)
      ? updatedRow.products[0]
      : updatedRow.products;

    const parsedMargins: number[] = Array.isArray(updatedRow.margins)
      ? (updatedRow.margins as number[])
      : typeof updatedRow.margins === 'string'
      ? JSON.parse(updatedRow.margins)
      : [0];

    const pricing = resolveStoreProductPricing({
      manualPriceBs: updatedRow.manual_price_bs != null ? Number(updatedRow.manual_price_bs) : null,
      catalogPriceBs,
      unitsPerBox: Number(updatedRow.units_per_box),
      margins: parsedMargins,
    });

    const responseDto: StoreProductDto = {
      id: updatedRow.id,
      productId: updatedRow.product_id,
      catalogDisplayName: prod.display_name,
      customName: updatedRow.custom_name,
      manualPriceBs: updatedRow.manual_price_bs != null ? Number(updatedRow.manual_price_bs) : null,
      unitsPerBox: Number(updatedRow.units_per_box),
      margins: parsedMargins,
      position: Number(updatedRow.position),
      baseBoxPriceBs: pricing.baseBoxPriceBs,
      previousPriceBs,
      unitPriceBs: pricing.unitPriceBs,
      salePrices: pricing.salePrices,
    };

    return jsonSuccess<StoreProductDto>(responseDto);
  } catch (error) {
    return handleApiError(error);
  }
}

export { PATCH as PUT };

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!isValidUuid(id)) {
      return notFound(MESSAGES.PRODUCT_NOT_IN_STORE);
    }

    const supabase = createServiceRoleClient();

    // 1. Verificar existencia
    const { data: existing, error: existError } = await supabase
      .from('store_products')
      .select('id')
      .or(`id.eq.${id},product_id.eq.${id}`)
      .maybeSingle();

    if (existError || !existing) {
      return notFound(MESSAGES.PRODUCT_NOT_IN_STORE);
    }

    // 2. Eliminar de store_products
    const { error: deleteError } = await supabase
      .from('store_products')
      .delete()
      .eq('id', existing.id);

    if (deleteError) {
      throw deleteError;
    }

    return jsonSuccess({ message: MESSAGES.PRODUCT_REMOVED_FROM_STORE });
  } catch (error) {
    return handleApiError(error);
  }
}
