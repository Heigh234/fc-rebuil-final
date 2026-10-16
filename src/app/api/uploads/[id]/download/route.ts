import { createServiceRoleClient, PDF_STORAGE_BUCKET } from '@/lib/supabase/server';
import { notFound, handleApiError } from '@/lib/api/http-error';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // 1. Obtener registro de la carga
    const { data: upload, error: uploadError } = await supabase
      .from('pdf_uploads')
      .select('original_filename, storage_path')
      .eq('id', id)
      .maybeSingle();

    if (uploadError || !upload) {
      return notFound('Carga no encontrada.');
    }

    // 2. Descargar PDF del depósito privado
    const { data: blob, error: downloadError } = await supabase.storage
      .from(PDF_STORAGE_BUCKET)
      .download(upload.storage_path);

    if (downloadError || !blob) {
      return notFound('El archivo no se encuentra en el almacenamiento.');
    }

    const buffer = await blob.arrayBuffer();
    const cleanFilename = upload.original_filename.replace(/["\r\n]/g, '');
    const encodedFilename = encodeURIComponent(cleanFilename);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${cleanFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
