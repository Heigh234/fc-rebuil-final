import { createServiceRoleClient } from '@/lib/supabase/server';
import { jsonSuccess, handleApiError } from '@/lib/api/http-error';
import type { InvoiceDto, InvoiceLineDto, CurrencyTag } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    // Consultar facturas ordenadas por created_at DESC junto con sus líneas y fecha de finalización
    const { data: rawInvoices, error: invoicesError } = await supabase
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
      .order('created_at', { ascending: false });

    if (invoicesError) {
      throw invoicesError;
    }

    const invoices: InvoiceDto[] = (rawInvoices ?? []).map((inv) => {
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

      return {
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
    });

    return jsonSuccess<InvoiceDto[]>(invoices);
  } catch (error) {
    return handleApiError(error);
  }
}
