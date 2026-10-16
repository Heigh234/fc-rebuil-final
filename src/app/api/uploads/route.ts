import { createServiceRoleClient } from '@/lib/supabase/server';
import { jsonSuccess, handleApiError } from '@/lib/api/http-error';
import type { UploadHistoryItemDto, UploadStatus } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    // 1. Limpieza de cargas pendientes expiradas (> 10 min)
    await supabase.rpc('expire_stale_pending_uploads');

    // 2. Obtener historial de cargas ordenado de la más reciente a la más antigua
    const { data: uploads, error } = await supabase
      .from('pdf_uploads')
      .select('id, original_filename, price_list_date, bcv_rate, product_count, status, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const history: UploadHistoryItemDto[] = (uploads ?? []).map((u) => ({
      id: u.id,
      originalFilename: u.original_filename,
      priceListDate: u.price_list_date ?? null,
      bcvRate: u.bcv_rate != null ? Number(u.bcv_rate) : null,
      productCount: Number(u.product_count ?? 0),
      status: u.status as UploadStatus,
      createdAt: u.created_at,
    }));

    return jsonSuccess<UploadHistoryItemDto[]>(history);
  } catch (error) {
    return handleApiError(error);
  }
}
