import { createServiceRoleClient, PDF_STORAGE_BUCKET } from '@/lib/supabase/server';
import { parseDistributorPdfForApp } from '@/lib/pdf/distributor-parser';
import {
  jsonSuccess,
  badRequest,
  notFound,
  conflict,
  unprocessable,
  serverError,
  handleApiError,
} from '@/lib/api/http-error';
import { MESSAGES } from '@/lib/i18n/messages';
import type { UploadProcessResponseDto } from '@/types/contracts';

export const dynamic = 'force-dynamic';

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let uploadId = '';
  try {
    const { id } = await context.params;
    uploadId = id;

    const supabase = createServiceRoleClient();

    // 1. Limpieza de cargas pendientes expiradas
    await supabase.rpc('expire_stale_pending_uploads');

    // 2. Verificar que la carga exista y esté en estado pendiente
    const { data: upload, error: uploadError } = await supabase
      .from('pdf_uploads')
      .select('*')
      .eq('id', uploadId)
      .maybeSingle();

    if (uploadError || !upload) {
      return notFound('Carga de PDF no encontrada.');
    }

    if (upload.status !== 'pending') {
      return conflict('La carga de PDF no está pendiente.');
    }

    // 3. Descargar archivo del depósito privado
    const { data: blob, error: downloadError } = await supabase.storage
      .from(PDF_STORAGE_BUCKET)
      .download(upload.storage_path);

    if (downloadError || !blob) {
      await supabase.from('pdf_uploads').update({ status: 'failed' }).eq('id', uploadId);
      return serverError('No se pudo descargar el archivo del depósito.');
    }

    // 4. Validar tamaño y cabecera mágica %PDF-
    const buffer = await blob.arrayBuffer();
    const pdfBytes = new Uint8Array(buffer);

    if (pdfBytes.length > MAX_PDF_SIZE_BYTES) {
      await supabase.from('pdf_uploads').update({ status: 'failed' }).eq('id', uploadId);
      return badRequest(MESSAGES.ERROR_FILE_TOO_LARGE);
    }

    if (
      pdfBytes.length < 5 ||
      new TextDecoder('ascii').decode(pdfBytes.subarray(0, 5)) !== '%PDF-'
    ) {
      await supabase.from('pdf_uploads').update({ status: 'failed' }).eq('id', uploadId);
      return badRequest(MESSAGES.ERROR_ONLY_PDF);
    }

    // 5. Extraer y procesar con el parser oficial adaptado
    const parseResult = await parseDistributorPdfForApp(pdfBytes);

    if (!parseResult.ok) {
      await supabase.from('pdf_uploads').update({ status: 'failed' }).eq('id', uploadId);
      return unprocessable(parseResult.userMessage);
    }

    // 6. Consultar si existe una carga activa vigente
    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('active_upload_id')
      .eq('singleton_key', true)
      .maybeSingle();

    let activeUpload: { id: string; price_list_date: string } | null = null;
    if (settings?.active_upload_id) {
      const { data: active } = await supabase
        .from('pdf_uploads')
        .select('id, price_list_date')
        .eq('id', settings.active_upload_id)
        .maybeSingle();

      if (active?.price_list_date) {
        activeUpload = { id: active.id, price_list_date: active.price_list_date };
      }
    }

    // 7. Si la fecha del PDF es anterior a la vigente, requiere confirmación
    if (activeUpload && parseResult.priceListDate < activeUpload.price_list_date) {
      await supabase
        .from('pdf_uploads')
        .update({
          price_list_date: parseResult.priceListDate,
          bcv_rate: parseResult.bcvRate,
          product_count: parseResult.products.length,
        })
        .eq('id', uploadId);

      return jsonSuccess<UploadProcessResponseDto>({
        status: 'requires_confirmation',
        uploadId,
        pdfDate: parseResult.priceListDate,
        activeDate: activeUpload.price_list_date,
      });
    }

    // 8. Aplicar la carga atómicamente a través de la función RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_pdf_upload', {
      p_upload_id: uploadId,
      p_price_list_date: parseResult.priceListDate,
      p_bcv_rate: parseResult.bcvRate,
      p_products: parseResult.products,
    });

    if (rpcError || !rpcResult) {
      await supabase.from('pdf_uploads').update({ status: 'failed' }).eq('id', uploadId);
      return serverError('No se pudo aplicar la carga de PDF.');
    }

    return jsonSuccess<UploadProcessResponseDto>({
      status: 'applied',
      uploadId,
      readCount: Number(rpcResult.read_count),
      newCount: Number(rpcResult.new_count),
      pricelessStoreCount: Number(rpcResult.priceless_store_count),
    });
  } catch (error) {
    if (uploadId) {
      try {
        const supabase = createServiceRoleClient();
        await supabase.from('pdf_uploads').update({ status: 'failed' }).eq('id', uploadId);
      } catch {
        // Ignorar fallo secundario de actualización
      }
    }
    return handleApiError(error);
  }
}
