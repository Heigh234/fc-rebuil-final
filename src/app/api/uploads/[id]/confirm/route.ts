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

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let uploadId = '';
  try {
    const { id } = await context.params;
    uploadId = id;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest('Cuerpo de petición inválido.');
    }

    if (!body || typeof body !== 'object' || !('decision' in body)) {
      return badRequest('Decisión requerida.');
    }

    const { decision } = body as { decision: unknown };

    if (decision !== 'confirm' && decision !== 'cancel') {
      return badRequest('Decisión inválida. Debe ser "confirm" o "cancel".');
    }

    const supabase = createServiceRoleClient();

    // 1. Limpieza de cargas pendientes expiradas
    await supabase.rpc('expire_stale_pending_uploads');

    // 2. Verificar existencia y estado 'pending' de la carga (CONT-REM-03)
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

    // 3. Si el usuario cancela, marcar como 'failed' sin error garantizando estado 'pending'
    if (decision === 'cancel') {
      await supabase
        .from('pdf_uploads')
        .update({ status: 'failed' })
        .eq('id', uploadId)
        .eq('status', 'pending');
      return jsonSuccess({ status: 'cancelled' });
    }

    // 4. Descargar el archivo desde el depósito
    const { data: blob, error: downloadError } = await supabase.storage
      .from(PDF_STORAGE_BUCKET)
      .download(upload.storage_path);

    if (downloadError || !blob) {
      await supabase
        .from('pdf_uploads')
        .update({ status: 'failed' })
        .eq('id', uploadId)
        .eq('status', 'pending');
      return serverError('No se pudo descargar el archivo del depósito.');
    }

    const buffer = await blob.arrayBuffer();
    const pdfBytes = new Uint8Array(buffer);

    // 5. Re-parsear el PDF
    const parseResult = await parseDistributorPdfForApp(pdfBytes);

    if (!parseResult.ok) {
      await supabase
        .from('pdf_uploads')
        .update({ status: 'failed' })
        .eq('id', uploadId)
        .eq('status', 'pending');
      return unprocessable(parseResult.userMessage);
    }

    // 6. Aplicar la carga
    const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_pdf_upload', {
      p_upload_id: uploadId,
      p_price_list_date: parseResult.priceListDate,
      p_bcv_rate: parseResult.bcvRate,
      p_products: parseResult.products,
    });

    if (rpcError || !rpcResult) {
      await supabase
        .from('pdf_uploads')
        .update({ status: 'failed' })
        .eq('id', uploadId)
        .eq('status', 'pending');
      return serverError('No se pudo aplicar la carga de PDF.');
    }

    return jsonSuccess({
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
        await supabase
          .from('pdf_uploads')
          .update({ status: 'failed' })
          .eq('id', uploadId)
          .eq('status', 'pending');
      } catch {
        // Ignorar fallo secundario
      }
    }
    return handleApiError(error);
  }
}
