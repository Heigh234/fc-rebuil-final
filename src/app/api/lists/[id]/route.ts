import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonSuccess,
  notFound,
  conflict,
  handleApiError,
} from '@/lib/api/http-error';
import {
  resolveOpenListItemPricing,
  calculateListSummary,
  roundHalfUp2,
  ListItemForSummary,
} from '@/lib/domain/pricing';
import { shoppingListInputSchema } from '@/lib/domain/validations';
import { MESSAGES } from '@/lib/i18n/messages';
import type {
  ShoppingListDetailDto,
  ShoppingListItemDto,
  InvoiceDto,
  InvoiceLineDto,
  CurrencyTag,
} from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // 1. Consultar lista
    const { data: list, error: listError } = await supabase
      .from('shopping_lists')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (listError || !list) {
      return notFound(MESSAGES.LIST_NOT_FOUND);
    }

    // 2. Si la lista está finalizada, leer datos capturados y factura
    if (list.status === 'finalized') {
      const { data: rawItems, error: itemsError } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', id)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (itemsError) {
        throw itemsError;
      }

      const items: ShoppingListItemDto[] = (rawItems ?? []).map((it) => {
        const boxPriceBs = it.captured_box_price_bs != null ? Number(it.captured_box_price_bs) : null;
        const lineTotalBs = boxPriceBs != null ? roundHalfUp2(it.quantity * boxPriceBs) : null;

        return {
          id: it.id,
          productId: it.product_id,
          productName: it.captured_product_name ?? '',
          quantity: it.quantity,
          currencyTag: it.currency_tag as CurrencyTag,
          boxPriceBs,
          lineTotalBs,
          position: Number(it.position),
        };
      });

      // Consultar factura y líneas de factura ordenadas alfabéticamente por product_name ASC
      const { data: invoiceRow } = await supabase
        .from('invoices')
        .select(`
          id,
          list_id,
          list_name,
          price_list_date,
          bcv_rate,
          total_bs,
          has_usd_lines,
          invoice_lines (
            id,
            product_name,
            quantity,
            box_price_bs,
            currency_tag,
            line_total_bs,
            position
          )
        `)
        .eq('list_id', id)
        .maybeSingle();

      let invoiceDto: InvoiceDto | null = null;
      if (invoiceRow) {
        const lines: InvoiceLineDto[] = (invoiceRow.invoice_lines ?? []).map((l) => ({
          id: l.id,
          productName: l.product_name,
          quantity: Number(l.quantity),
          boxPriceBs: Number(l.box_price_bs),
          currencyTag: l.currency_tag as CurrencyTag,
          lineTotalBs: Number(l.line_total_bs),
          position: Number(l.position),
        }));

        lines.sort((a, b) => a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' }));

        invoiceDto = {
          id: invoiceRow.id,
          listId: invoiceRow.list_id,
          listName: invoiceRow.list_name,
          finalizedAt: list.finalized_at,
          priceListDate: invoiceRow.price_list_date,
          bcvRate: Number(invoiceRow.bcv_rate),
          totalBs: Number(invoiceRow.total_bs),
          hasUsdLines: invoiceRow.has_usd_lines,
          lines,
        };
      }

      const usdCount = items.filter((it) => it.currencyTag === 'USD').length;
      const totalBs = invoiceDto ? invoiceDto.totalBs : 0;

      const detailDto: ShoppingListDetailDto = {
        id: list.id,
        name: list.name,
        status: 'finalized',
        createdAt: list.created_at,
        finalizedAt: list.finalized_at,
        capturedBcvRate: list.captured_bcv_rate != null ? Number(list.captured_bcv_rate) : null,
        capturedPriceListDate: list.captured_price_list_date,
        totalBs,
        usdItemCount: usdCount,
        pricelessItemCount: 0,
        items,
        invoice: invoiceDto,
      };

      return jsonSuccess<ShoppingListDetailDto>(detailDto);
    }

    // 3. Si la lista está abierta, resolver precios y nombres en vivo
    const { data: rawItems, error: itemsError } = await supabase
      .from('shopping_list_items')
      .select(`
        id,
        product_id,
        quantity,
        currency_tag,
        position,
        products!inner (
          id,
          display_name
        )
      `)
      .eq('list_id', id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (itemsError) {
      throw itemsError;
    }

    // Consultar datos de Mi tienda
    const { data: storeProducts } = await supabase
      .from('store_products')
      .select('product_id, custom_name, manual_price_bs');

    const storeMap = new Map<string, { customName: string; manualPriceBs: number | null }>();
    for (const sp of storeProducts ?? []) {
      storeMap.set(sp.product_id, {
        customName: sp.custom_name,
        manualPriceBs: sp.manual_price_bs != null ? Number(sp.manual_price_bs) : null,
      });
    }

    // Consultar precios de la carga activa
    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('active_upload_id')
      .eq('singleton_key', true)
      .maybeSingle();

    const catalogPriceMap = new Map<string, number>();
    if (settings?.active_upload_id) {
      const { data: activePrices } = await supabase
        .from('product_prices')
        .select('product_id, box_price_bs')
        .eq('upload_id', settings.active_upload_id);

      for (const ap of activePrices ?? []) {
        catalogPriceMap.set(ap.product_id, Number(ap.box_price_bs));
      }
    }

    // Resolver ítems y cálculo de resumen
    const summaryInput: ListItemForSummary[] = [];

    const items: ShoppingListItemDto[] = (rawItems ?? []).map((it) => {
      const prod = Array.isArray(it.products) ? it.products[0] : it.products;
      const storeInfo = storeMap.get(it.product_id);
      const catalogPriceBs = catalogPriceMap.get(it.product_id) ?? null;

      const resolved = resolveOpenListItemPricing({
        isInStore: storeInfo !== undefined,
        customName: storeInfo?.customName,
        manualPriceBs: storeInfo?.manualPriceBs,
        catalogDisplayName: prod.display_name,
        catalogPriceBs,
        quantity: it.quantity,
        currencyTag: it.currency_tag as CurrencyTag,
      });

      summaryInput.push({
        currencyTag: it.currency_tag as CurrencyTag,
        boxPriceBs: resolved.boxPriceBs,
        quantity: it.quantity,
      });

      return {
        id: it.id,
        productId: it.product_id,
        productName: resolved.productName,
        quantity: it.quantity,
        currencyTag: it.currency_tag as CurrencyTag,
        boxPriceBs: resolved.boxPriceBs,
        lineTotalBs: resolved.lineTotalBs,
        position: Number(it.position),
      };
    });

    const summary = calculateListSummary(summaryInput);

    const detailDto: ShoppingListDetailDto = {
      id: list.id,
      name: list.name,
      status: 'open',
      createdAt: list.created_at,
      finalizedAt: null,
      capturedBcvRate: null,
      capturedPriceListDate: null,
      totalBs: summary.totalBs,
      usdItemCount: summary.usdItemCount,
      pricelessItemCount: summary.pricelessItemCount,
      items,
      invoice: null,
    };

    return jsonSuccess<ShoppingListDetailDto>(detailDto);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const rawBody = await request.json().catch(() => null);
    const parsed = shoppingListInputSchema.safeParse(rawBody);

    if (!parsed.success) {
      return handleApiError(parsed.error);
    }

    const { name } = parsed.data;
    const supabase = createServiceRoleClient();

    // 1. Verificar existencia y estado
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

    // 2. Actualizar nombre
    const { data: updated, error: updateError } = await supabase
      .from('shopping_lists')
      .update({ name })
      .eq('id', id)
      .select('id, name, status')
      .single();

    if (updateError || !updated) {
      throw updateError;
    }

    return jsonSuccess(updated);
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
    const supabase = createServiceRoleClient();

    // 1. Verificar existencia y estado
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

    // 2. Eliminar lista (cascada a ítems)
    const { error: deleteError } = await supabase
      .from('shopping_lists')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    return jsonSuccess({ message: MESSAGES.LIST_DELETED });
  } catch (error) {
    return handleApiError(error);
  }
}
