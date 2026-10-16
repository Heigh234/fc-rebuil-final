import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonCreated,
  notFound,
  conflict,
  handleApiError,
} from '@/lib/api/http-error';
import { resolveOpenListItemPricing } from '@/lib/domain/pricing';
import { shoppingListItemInputSchema } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';
import type { ShoppingListItemDto, CurrencyTag } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const rawBody = await request.json().catch(() => ({}));

    if (!rawBody || typeof rawBody !== 'object' || !('productId' in rawBody)) {
      return notFound('Identificador de producto requerido.');
    }

    const productId = String(rawBody.productId).trim();
    if (!productId) {
      return notFound('Identificador de producto requerido.');
    }

    const parsedItem = shoppingListItemInputSchema.safeParse(rawBody);
    if (!parsedItem.success) {
      return handleApiError(parsedItem.error);
    }

    const { quantity, currencyTag } = parsedItem.data;
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

    // 2. Verificar existencia del producto en el catálogo base
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('id, display_name')
      .eq('id', productId)
      .maybeSingle();

    if (prodError || !product) {
      return notFound('Producto no encontrado.');
    }

    // 3. Verificar si el producto ya está en esta lista
    const { data: existingItem } = await supabase
      .from('shopping_list_items')
      .select('id')
      .eq('list_id', id)
      .eq('product_id', productId)
      .maybeSingle();

    if (existingItem) {
      return conflict(MESSAGES.PRODUCT_ALREADY_IN_LIST);
    }

    // 4. Calcular siguiente posición
    const { data: maxPosRow } = await supabase
      .from('shopping_list_items')
      .select('position')
      .eq('list_id', id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = maxPosRow && maxPosRow.position != null ? maxPosRow.position + 1 : 0;

    // 5. Insertar ítem
    const { data: inserted, error: insertError } = await supabase
      .from('shopping_list_items')
      .insert({
        list_id: id,
        product_id: productId,
        quantity,
        currency_tag: currencyTag,
        position: nextPosition,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      throw insertError;
    }

    // 6. Resolver precio para la respuesta
    const { data: storeProduct } = await supabase
      .from('store_products')
      .select('custom_name, manual_price_bs')
      .eq('product_id', productId)
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
        .eq('product_id', productId)
        .maybeSingle();

      if (priceRow) {
        catalogPriceBs = Number(priceRow.box_price_bs);
      }
    }

    const resolved = resolveOpenListItemPricing({
      isInStore: storeProduct !== null,
      customName: storeProduct?.custom_name,
      manualPriceBs: storeProduct?.manual_price_bs != null ? Number(storeProduct.manual_price_bs) : null,
      catalogDisplayName: product.display_name,
      catalogPriceBs,
      quantity,
      currencyTag: currencyTag as CurrencyTag,
    });

    const responseDto: ShoppingListItemDto = {
      id: inserted.id,
      productId: inserted.product_id,
      productName: resolved.productName,
      quantity: inserted.quantity,
      currencyTag: inserted.currency_tag as CurrencyTag,
      boxPriceBs: resolved.boxPriceBs,
      lineTotalBs: resolved.lineTotalBs,
      position: Number(inserted.position),
    };

    return jsonCreated<ShoppingListItemDto>(responseDto);
  } catch (error) {
    return handleApiError(error);
  }
}
