import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonSuccess,
  notFound,
  conflict,
  handleApiError,
} from '@/lib/api/http-error';
import { resolveOpenListItemPricing } from '@/lib/domain/pricing';
import { shoppingListItemInputSchema } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';
import type { ShoppingListItemDto, CurrencyTag } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await context.params;
    const rawBody = await request.json().catch(() => ({}));

    const partialSchema = shoppingListItemInputSchema.partial();
    const parsed = partialSchema.safeParse(rawBody);

    if (!parsed.success) {
      return handleApiError(parsed.error);
    }

    const updates = parsed.data;
    const supabase = createServiceRoleClient();

    // 1. Verificar existencia y estado de la lista
    const { data: list, error: listError } = await supabase
      .from('shopping_lists')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (listError || !list) {
      return notFound(MESSAGES.LIST_NOT_FOUND);
    }

    if (list.status === 'finalized') {
      return conflict(MESSAGES.LIST_ALREADY_FINALIZED);
    }

    // 2. Verificar existencia del ítem en la lista
    const { data: existingItem, error: itemError } = await supabase
      .from('shopping_list_items')
      .select(`
        id,
        list_id,
        product_id,
        quantity,
        currency_tag,
        position,
        products!inner (
          id,
          display_name
        )
      `)
      .eq('id', itemId)
      .eq('list_id', id)
      .maybeSingle();

    if (itemError || !existingItem) {
      return notFound(MESSAGES.PRODUCT_NOT_IN_LIST);
    }

    // 3. Preparar actualización
    const payloadToUpdate: Record<string, unknown> = {};
    if (updates.quantity !== undefined) {
      payloadToUpdate.quantity = updates.quantity;
    }
    if (updates.currencyTag !== undefined) {
      payloadToUpdate.currency_tag = updates.currencyTag;
    }

    let updatedItem = existingItem;
    if (Object.keys(payloadToUpdate).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from('shopping_list_items')
        .update(payloadToUpdate)
        .eq('id', itemId)
        .select(`
          id,
          list_id,
          product_id,
          quantity,
          currency_tag,
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
      updatedItem = updated;
    }

    // 4. Resolver precios
    const { data: storeProduct } = await supabase
      .from('store_products')
      .select('custom_name, manual_price_bs')
      .eq('product_id', updatedItem.product_id)
      .maybeSingle();

    let catalogPriceBs: number | null = null;
    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('active_upload_id')
      .eq('singleton_key', true)
      .maybeSingle();

    if (settings?.active_upload_id) {
      const { data: priceRow } = await supabase
        .from('product_prices')
        .select('box_price_bs')
        .eq('upload_id', settings.active_upload_id)
        .eq('product_id', updatedItem.product_id)
        .maybeSingle();

      if (priceRow) {
        catalogPriceBs = Number(priceRow.box_price_bs);
      }
    }

    const prod = Array.isArray(updatedItem.products)
      ? updatedItem.products[0]
      : updatedItem.products;

    const resolved = resolveOpenListItemPricing({
      isInStore: storeProduct !== null,
      customName: storeProduct?.custom_name,
      manualPriceBs: storeProduct?.manual_price_bs != null ? Number(storeProduct.manual_price_bs) : null,
      catalogDisplayName: prod.display_name,
      catalogPriceBs,
      quantity: updatedItem.quantity,
      currencyTag: updatedItem.currency_tag as CurrencyTag,
    });

    const responseDto: ShoppingListItemDto = {
      id: updatedItem.id,
      productId: updatedItem.product_id,
      productName: resolved.productName,
      quantity: updatedItem.quantity,
      currencyTag: updatedItem.currency_tag as CurrencyTag,
      boxPriceBs: resolved.boxPriceBs,
      lineTotalBs: resolved.lineTotalBs,
      position: Number(updatedItem.position),
    };

    return jsonSuccess<ShoppingListItemDto>(responseDto);
  } catch (error) {
    return handleApiError(error);
  }
}

export { PATCH as PUT };

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await context.params;
    const supabase = createServiceRoleClient();

    // 1. Verificar existencia y estado de la lista
    const { data: list, error: listError } = await supabase
      .from('shopping_lists')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (listError || !list) {
      return notFound(MESSAGES.LIST_NOT_FOUND);
    }

    if (list.status === 'finalized') {
      return conflict(MESSAGES.LIST_ALREADY_FINALIZED);
    }

    // 2. Verificar existencia del ítem en la lista
    const { data: existingItem, error: itemError } = await supabase
      .from('shopping_list_items')
      .select('id')
      .eq('id', itemId)
      .eq('list_id', id)
      .maybeSingle();

    if (itemError || !existingItem) {
      return notFound(MESSAGES.PRODUCT_NOT_IN_LIST);
    }

    // 3. Eliminar ítem
    const { error: deleteError } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('id', itemId);

    if (deleteError) {
      throw deleteError;
    }

    return jsonSuccess({ message: MESSAGES.PRODUCT_REMOVED_FROM_LIST });
  } catch (error) {
    return handleApiError(error);
  }
}
