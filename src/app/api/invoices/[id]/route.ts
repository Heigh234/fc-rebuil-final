import { createServiceRoleClient } from '@/lib/supabase/server';
import { jsonSuccess, notFound, handleApiError } from '@/lib/api/http-error';
import { isValidUuid } from '@/lib/domain/validations';
import type { InvoiceDto, InvoiceLineDto, CurrencyTag } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!isValidUuid(id)) {
      return notFound('Factura no encontrada.');
    }

    const supabase = createServiceRoleClient();

    // Consultar factura por ID de factura o por list_id
    const { data: inv, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        id,
        list_id,
        list_name,
        price_list_date,
        bcv_rate,
        total_bs,
        has_usd_lines,
        created_at,
        shopping_lists (
          finalized_at
        ),
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
      .or(`id.eq.${id},list_id.eq.${id}`)
      .maybeSingle();

    if (invoiceError || !inv) {
      return notFound('Factura no encontrada.');
    }

    const sl = Array.isArray(inv.shopping_lists) ? inv.shopping_lists[0] : inv.shopping_lists;
    const finalizedAt = sl?.finalized_at ?? inv.created_at;

    const lines: InvoiceLineDto[] = (inv.invoice_lines ?? []).map((l) => ({
      id: l.id,
      productName: l.product_name,
      quantity: Number(l.quantity),
      boxPriceBs: Number(l.box_price_bs),
      currencyTag: l.currency_tag as CurrencyTag,
      lineTotalBs: Number(l.line_total_bs),
      position: Number(l.position),
    }));

    // Orden alfabético por product_name ASC (Sección 17)
    lines.sort((a, b) => a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' }));

    const invoiceDto: InvoiceDto = {
      id: inv.id,
      listId: inv.list_id,
      listName: inv.list_name,
      finalizedAt,
      priceListDate: inv.price_list_date,
      bcvRate: Number(inv.bcv_rate),
      totalBs: Number(inv.total_bs),
      hasUsdLines: Boolean(inv.has_usd_lines),
      lines,
    };

    return jsonSuccess<InvoiceDto>(invoiceDto);
  } catch (error) {
    return handleApiError(error);
  }
}
