import { createServiceRoleClient } from '@/lib/supabase/server';
import { jsonSuccess, handleApiError } from '@/lib/api/http-error';
import type { WorkspaceStateDto, ActiveUploadSummaryDto } from '@/types/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    // 1. Marcar como 'failed' cargas pendientes mayores a 10 minutos
    await supabase.rpc('expire_stale_pending_uploads');

    // 2. Asegurar que exista el registro único de configuración
    await supabase.rpc('ensure_workspace_settings');

    // 3. Consultar configuración activa
    const { data: settings, error: settingsError } = await supabase
      .from('workspace_settings')
      .select('active_upload_id')
      .eq('singleton_key', true)
      .maybeSingle();

    if (settingsError) {
      throw settingsError;
    }

    if (!settings?.active_upload_id) {
      return jsonSuccess<WorkspaceStateDto>({ activeUpload: null });
    }

    // 4. Consultar datos de la carga activa
    const { data: upload, error: uploadError } = await supabase
      .from('pdf_uploads')
      .select('id, original_filename, price_list_date, bcv_rate, product_count, created_at')
      .eq('id', settings.active_upload_id)
      .maybeSingle();

    if (uploadError) {
      throw uploadError;
    }

    if (!upload || !upload.price_list_date || upload.bcv_rate == null) {
      return jsonSuccess<WorkspaceStateDto>({ activeUpload: null });
    }

    const activeUpload: ActiveUploadSummaryDto = {
      id: upload.id,
      originalFilename: upload.original_filename,
      priceListDate: upload.price_list_date,
      bcvRate: Number(upload.bcv_rate),
      productCount: Number(upload.product_count ?? 0),
      createdAt: upload.created_at,
    };

    return jsonSuccess<WorkspaceStateDto>({ activeUpload });
  } catch (error) {
    return handleApiError(error);
  }
}
