import { createServiceRoleClient } from '@/lib/supabase/server';
import { jsonSuccess, notFound, handleApiError } from '@/lib/api/http-error';
import type { ProductPriceHistoryItemDto } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await context.params;
    const supabase = createServiceRoleClient();

    // 1. Verificar existencia del producto
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle();

    if (productError || !product) {
      return notFound('Producto no encontrado.');
    }

    // 2. Consultar precios históricos vinculados a cargas aplicadas o no aplicadas
    const { data: rawPrices, error: pricesError } = await supabase
      .from('product_prices')
      .select(`
        upload_id,
        box_price_bs,
        pdf_uploads!inner (
          id,
          price_list_date,
          status,
          created_at
        )
      `)
      .eq('product_id', productId)
      .in('pdf_uploads.status', ['applied', 'not_applied']);

    if (pricesError) {
      throw pricesError;
    }

    // 3. Normalizar y ordenar por price_list_date DESC y created_at DESC (Sección 17: L753)
    type PriceRow = {
      upload_id: string;
      box_price_bs: number | string;
      pdf_uploads: {
        id: string;
        price_list_date: string | null;
        status: string;
        created_at: string;
      } | {
        id: string;
        price_list_date: string | null;
        status: string;
        created_at: string;
      }[];
    };

    const validRows = ((rawPrices as unknown as PriceRow[]) ?? []).filter((row) => {
      const upload = Array.isArray(row.pdf_uploads) ? row.pdf_uploads[0] : row.pdf_uploads;
      return upload && upload.price_list_date != null;
    });

    validRows.sort((a, b) => {
      const uploadA = Array.isArray(a.pdf_uploads) ? a.pdf_uploads[0] : a.pdf_uploads;
      const uploadB = Array.isArray(b.pdf_uploads) ? b.pdf_uploads[0] : b.pdf_uploads;

      const dateComp = (uploadB.price_list_date ?? '').localeCompare(uploadA.price_list_date ?? '');
      if (dateComp !== 0) {
        return dateComp;
      }

      return new Date(uploadB.created_at).getTime() - new Date(uploadA.created_at).getTime();
    });

    // 4. Mapear a DTO marcando la primera fila con isCurrent: true
    const history: ProductPriceHistoryItemDto[] = validRows.map((row, index) => {
      const upload = Array.isArray(row.pdf_uploads) ? row.pdf_uploads[0] : row.pdf_uploads;
      return {
        uploadId: row.upload_id,
        priceListDate: upload.price_list_date as string,
        boxPriceBs: Number(row.box_price_bs),
        isCurrent: index === 0,
      };
    });

    return jsonSuccess<ProductPriceHistoryItemDto[]>(history);
  } catch (error) {
    return handleApiError(error);
  }
}
