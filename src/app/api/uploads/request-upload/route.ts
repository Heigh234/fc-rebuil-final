import { createServiceRoleClient, PDF_STORAGE_BUCKET } from '@/lib/supabase/server';
import {
  jsonCreated,
  badRequest,
  serverError,
  handleApiError,
} from '@/lib/api/http-error';
import { MESSAGES } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest(MESSAGES.ERROR_NO_FILE);
    }

    if (!body || typeof body !== 'object') {
      return badRequest(MESSAGES.ERROR_NO_FILE);
    }

    const { filename, mimeType, sizeBytes } = body as Record<string, unknown>;

    // 1. Validar presencia de archivo
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      return badRequest(MESSAGES.ERROR_NO_FILE);
    }

    const trimmedFilename = filename.trim();

    // 2. Validar tipo PDF
    if (mimeType !== 'application/pdf' || !trimmedFilename.toLowerCase().endsWith('.pdf')) {
      return badRequest(MESSAGES.ERROR_ONLY_PDF);
    }

    // 3. Validar tamaño
    if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
      return badRequest(MESSAGES.ERROR_NO_FILE);
    }

    if (sizeBytes > MAX_PDF_SIZE_BYTES) {
      return badRequest(MESSAGES.ERROR_FILE_TOO_LARGE);
    }

    const supabase = createServiceRoleClient();

    // 4. Limpieza de cargas pendientes expiradas
    await supabase.rpc('expire_stale_pending_uploads');

    // 5. Crear identificador único y ruta de almacenamiento
    const uploadId = crypto.randomUUID();
    const storagePath = `${uploadId}.pdf`;

    // 6. Insertar registro pendiente en pdf_uploads
    const { error: insertError } = await supabase.from('pdf_uploads').insert({
      id: uploadId,
      storage_path: storagePath,
      original_filename: trimmedFilename,
      status: 'pending',
      product_count: 0,
    });

    if (insertError) {
      throw insertError;
    }

    // 7. Generar URL firmada de subida (validez de corta duración)
    const { data: signedData, error: signedError } = await supabase.storage
      .from(PDF_STORAGE_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData) {
      await supabase.from('pdf_uploads').update({ status: 'failed' }).eq('id', uploadId);
      return serverError();
    }

    return jsonCreated({
      uploadId,
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      path: signedData.path,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
