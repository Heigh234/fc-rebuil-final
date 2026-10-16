import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  jsonSuccess,
  notFound,
  unprocessable,
  serverError,
  handleApiError,
} from '@/lib/api/http-error';
import { MESSAGES } from '@/lib/i18n/messages';
import type { InvoiceDto, InvoiceLineDto, CurrencyTag } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: rpcResult, error: rpcError } = await supabase.rpc('finalize_shopping_list', {
      p_list_id: id,
    });

    if (rpcError) {
      const msg = rpcError.message || '';

      if (msg.includes('Esta lista ya no existe') || rpcError.code === 'P0002') {
        return notFound(MESSAGES.LIST_NOT_FOUND);
      }
      if (msg.includes('La lista está vacía') || rpcError.code === 'P0010') {
        return unprocessable(MESSAGES.FINALIZE_ERROR_EMPTY);
      }
      if (msg.includes('Carga un PDF de precios') || rpcError.code === 'P0011') {
        return unprocessable(MESSAGES.FINALIZE_ERROR_NO_ACTIVE_UPLOAD);
      }
      if (msg.includes('Hay productos sin precio') || rpcError.code === 'P0012') {
        return unprocessable(MESSAGES.FINALIZE_ERROR_PRICELESS);
      }

      return serverError(MESSAGES.INVOICE_GENERATE_ERROR);
    }

    if (!rpcResult) {
      return serverError(MESSAGES.INVOICE_GENERATE_ERROR);
    }

    const rawInvoice = rpcResult as Record<string, unknown>;
    const rawLines = Array.isArray(rawInvoice.lines) ? (rawInvoice.lines as Record<string, unknown>[]) : [];

    const lines: InvoiceLineDto[] = rawLines.map((l) => ({
      id: String(l.id),
      productName: String(l.productName),
      quantity: Number(l.quantity),
      boxPriceBs: Number(l.boxPriceBs),
      currencyTag: l.currencyTag as CurrencyTag,
      lineTotalBs: Number(l.lineTotalBs),
      position: Number(l.position),
    }));

    // Asegurar orden alfabético estricto de líneas por productName
    lines.sort((a, b) => a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' }));

    const invoiceDto: InvoiceDto = {
      id: String(rawInvoice.id),
      listId: String(rawInvoice.listId),
      listName: String(rawInvoice.listName),
      finalizedAt: String(rawInvoice.finalizedAt),
      priceListDate: String(rawInvoice.priceListDate),
      bcvRate: Number(rawInvoice.bcvRate),
      totalBs: Number(rawInvoice.totalBs),
      hasUsdLines: Boolean(rawInvoice.hasUsdLines),
      lines,
    };

    return jsonSuccess<InvoiceDto>(invoiceDto);
  } catch (error) {
    return handleApiError(error);
  }
}
